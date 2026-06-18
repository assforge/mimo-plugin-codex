#!/usr/bin/env node

/**
 * mimo-companion.mjs — Bridge between Claude Code plugin and MiMo CLI.
 *
 * Wraps `mimo run` to provide:
 *   - task delegation (foreground/background)
 *   - code review
 *   - status/result/cancel for background jobs
 *   - setup check with self-healing
 *
 * Validation model follows Codex plugin pattern:
 *   - binaryAvailable(): check if CLI binary exists and responds
 *   - getMimoAvailability(): check if mimo CLI is functional
 *   - getMimoAuthStatus(): check if mimo is authenticated
 *   - Entry-point guards on every command
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const JOB_DIR = path.join(ROOT_DIR, ".jobs");

// --- Process helpers (ported from Codex process.mjs) ---

function runCommand(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    input: options.input,
    maxBuffer: options.maxBuffer,
    stdio: options.stdio ?? "pipe",
    shell: process.platform === "win32" ? (process.env.SHELL || true) : false,
    windowsHide: true
  });

  return {
    command,
    args,
    status: result.status ?? 0,
    signal: result.signal ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ?? null
  };
}

function binaryAvailable(command, versionArgs = ["--version"], options = {}) {
  const result = runCommand(command, versionArgs, options);
  if (result.error && result.error.code === "ENOENT") {
    return { available: false, detail: "not found" };
  }
  if (result.error) {
    return { available: false, detail: result.error.message };
  }
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`;
    return { available: false, detail };
  }
  return { available: true, detail: result.stdout.trim() || result.stderr.trim() || "ok" };
}

// --- Mimo availability checks (ported from Codex codex.mjs) ---

function getMimoAvailability(cwd) {
  const versionStatus = binaryAvailable("mimo", ["--version"], { cwd });
  if (!versionStatus.available) {
    return versionStatus;
  }

  const runHelpStatus = binaryAvailable("mimo", ["run", "--help"], { cwd });
  if (!runHelpStatus.available) {
    return {
      available: false,
      detail: `${versionStatus.detail}; run command unavailable: ${runHelpStatus.detail}`
    };
  }

  return {
    available: true,
    detail: `${versionStatus.detail}; runtime available`
  };
}

function getMimoAuthStatus(cwd) {
  const availability = getMimoAvailability(cwd);
  if (!availability.available) {
    return {
      available: false,
      loggedIn: false,
      detail: availability.detail,
      source: "availability"
    };
  }

  const providerStatus = binaryAvailable("mimo", ["providers", "--json"], { cwd });
  if (!providerStatus.available) {
    return {
      available: true,
      loggedIn: false,
      detail: "providers command unavailable",
      source: "providers"
    };
  }

  try {
    const providers = JSON.parse(providerStatus.stdout);
    const hasAuth = Array.isArray(providers) && providers.some(p => p.apiKey || p.token || p.loggedIn);
    return {
      available: true,
      loggedIn: hasAuth,
      detail: hasAuth ? "authenticated" : "not authenticated",
      source: "providers"
    };
  } catch {
    return {
      available: true,
      loggedIn: false,
      detail: "could not parse providers output",
      source: "providers"
    };
  }
}

function renderSetupReport(report) {
  const lines = [
    "# MiMo Setup",
    "",
    `Status: ${report.ready ? "ready" : "needs attention"}`,
    "",
    "Checks:",
    `- node: ${report.node.detail}`,
    `- mimo: ${report.mimo.detail}`,
    `- auth: ${report.auth.detail}`,
    ""
  ];

  if (report.actionsTaken.length > 0) {
    lines.push("Actions taken:");
    for (const action of report.actionsTaken) {
      lines.push(`- ${action}`);
    }
    lines.push("");
  }

  if (report.recommendations.length > 0) {
    lines.push("Recommendations:");
    for (const rec of report.recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function ensureAvailabilityOrExit(cwd) {
  const availability = getMimoAvailability(cwd);
  if (!availability.available) {
    console.error(`❌ MiMo CLI not available: ${availability.detail}`);
    console.error("Run `mimo setup` or install with: npm install -g mimocode");
    process.exit(1);
  }
  return availability;
}

// --- Job helpers ---

function ensureJobDir() {
  if (!fs.existsSync(JOB_DIR)) fs.mkdirSync(JOB_DIR, { recursive: true });
}

function generateJobId() {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function writeJobFile(jobId, data) {
  ensureJobDir();
  fs.writeFileSync(path.join(JOB_DIR, `${jobId}.json`), JSON.stringify(data, null, 2));
}

function readJobFile(jobId) {
  const p = path.join(JOB_DIR, `${jobId}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function listJobs() {
  ensureJobDir();
  return fs.readdirSync(JOB_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(fs.readFileSync(path.join(JOB_DIR, f), "utf-8")))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function runMimo(args, opts = {}) {
  if (opts.background) {
    // Background: capture stdout/stderr to a log file, wait for close to
    // resolve so the caller knows when the process actually finishes.
    // Do NOT use detached/unref — the parent must stay alive to receive the
    // close event and write the final job status.  "Background" here means
    // the caller's own process is fire-and-forget from the USER's perspective
    // (the shell prompt returns immediately while the companion waits).
    const logFile = path.join(JOB_DIR, `${opts.jobId ?? "bg"}-mimo.log`);
    ensureJobDir();
    const logFd = fs.openSync(logFile, "a");
    const child = spawn("mimo", args, {
      stdio: ["ignore", logFd, logFd],
      ...opts,
    });
    return new Promise((resolve) => {
      child.on("close", (code) => {
        try { fs.closeSync(logFd); } catch {}
        let output = "";
        try { output = fs.readFileSync(logFile, "utf-8"); } catch {}
        resolve({ background: true, pid: child.pid, code, output, logFile });
      });
      child.on("error", () => {
        try { fs.closeSync(logFd); } catch {}
        resolve({ background: true, pid: child.pid, code: 1, output: "", logFile });
      });
    });
  }

  // Foreground: capture to memory.
  return new Promise((resolve, reject) => {
    const child = spawn("mimo", args, { stdio: "pipe", ...opts });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr, code });
      else reject(new Error(`mimo exited with code ${code}\n${stderr}`));
    });
  });
}

// --- Commands ---

async function cmdSetup(argv) {
  const asJson = argv.includes("--json");
  const cwd = process.cwd();

  const nodeStatus = binaryAvailable("node", ["--version"]);
  const npmStatus = binaryAvailable("npm", ["--version"]);
  const mimoAvailability = getMimoAvailability(cwd);
  const mimoAuth = getMimoAuthStatus(cwd);

  const actionsTaken = [];
  const recommendations = [];

  if (!mimoAvailability.available && npmStatus.available) {
    if (!asJson) {
      console.log("MiMo CLI not found. npm is available for installation.");
      console.log("To install, run: npm install -g mimocode");
      recommendations.push("Install MiMo CLI: npm install -g mimocode");
    }
  }

  if (mimoAvailability.available && !mimoAuth.loggedIn) {
    recommendations.push("Run `mimo providers` to configure authentication");
  }

  const report = {
    ready: mimoAvailability.available && mimoAuth.loggedIn,
    node: nodeStatus,
    npm: npmStatus,
    mimo: mimoAvailability,
    auth: mimoAuth,
    actionsTaken,
    recommendations
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderSetupReport(report));
  }
}

async function cmdReview(argv) {
  ensureAvailabilityOrExit(process.cwd());

  const args = argv;
  const background = args.includes("--background");
  const wait = args.includes("--wait");
  const baseIdx = args.indexOf("--base");
  const base = baseIdx >= 0 ? args[baseIdx + 1] : null;

  let prompt = "Review the current code changes for quality, security, and best practices.";
  if (base) {
    prompt = `Review the changes compared to ${base}. Focus on quality, security, and best practices.`;
  }
  if (args.filter(a => !a.startsWith("--") && a !== base).length > 0) {
    prompt = args.filter(a => !a.startsWith("--") && a !== base).join(" ");
  }

  const jobId = generateJobId();
  const job = {
    id: jobId,
    type: "review",
    prompt,
    status: "running",
    createdAt: new Date().toISOString(),
  };

  if (background) {
    writeJobFile(jobId, job);
    const mimoArgs = ["run", "--dir", process.cwd(), prompt];
    runMimo(mimoArgs, { background: true, jobId }).then(({ pid, code, output, logFile }) => {
      job.pid = pid;
      job.logFile = logFile;
      job.status = code === 0 ? "completed" : "failed";
      job.completedAt = new Date().toISOString();
      if (output) job.output = output;
      if (code !== 0) job.error = `mimo exited with code ${code}`;
      writeJobFile(jobId, job);
    }).catch((err) => {
      job.status = "failed";
      job.error = err.message;
      job.completedAt = new Date().toISOString();
      writeJobFile(jobId, job);
    });
    console.log(`📋 Review job started: ${jobId}`);
    console.log(`   Use /mimo:status ${jobId} to check progress`);
    console.log(`   Use /mimo:result ${jobId} to see output when done`);
  } else {
    console.log("🔍 Running MiMo review...");
    try {
      const result = await runMimo(["run", "--dir", process.cwd(), prompt]);
      console.log(result.stdout);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }
}

async function cmdRescue(argv) {
  ensureAvailabilityOrExit(process.cwd());

  const args = argv;
  const background = args.includes("--background");
  const wait = args.includes("--wait");
  const modelIdx = args.indexOf("--model");
  const model = modelIdx >= 0 ? args[modelIdx + 1] : null;

  const taskText = args
    .filter(a => !a.startsWith("--") && a !== model)
    .join(" ");

  if (!taskText) {
    console.log("What should MiMo investigate or fix?");
    process.exit(1);
  }

  const jobId = generateJobId();
  const job = {
    id: jobId,
    type: "rescue",
    prompt: taskText,
    status: "running",
    createdAt: new Date().toISOString(),
  };

  writeJobFile(jobId, job);

  const mimoArgs = ["run", "--dir", process.cwd()];
  if (model) mimoArgs.push("--model", model);
  mimoArgs.push(taskText);

  if (background) {
    runMimo(mimoArgs, { background: true, jobId }).then(({ pid, code, output, logFile }) => {
      job.pid = pid;
      job.logFile = logFile;
      job.status = code === 0 ? "completed" : "failed";
      job.completedAt = new Date().toISOString();
      if (output) job.output = output;
      if (code !== 0) job.error = `mimo exited with code ${code}`;
      writeJobFile(jobId, job);
    }).catch((err) => {
      job.status = "failed";
      job.error = err.message;
      job.completedAt = new Date().toISOString();
      writeJobFile(jobId, job);
    });
    // Report "running" now; the close handler above will flip to completed/failed.
    console.log(`🚀 Rescue job started: ${jobId}`);
    console.log(`   Task: ${taskText}`);
    console.log(`   Use /mimo:status ${jobId} to check progress`);
    console.log(`   Use /mimo:result ${jobId} to see output when done`);
  } else {
    console.log("🚀 Running MiMo rescue...");
    try {
      const result = await runMimo(mimoArgs);
      job.status = "completed";
      job.completedAt = new Date().toISOString();
      job.output = result.stdout;
      writeJobFile(jobId, job);
      console.log(result.stdout);
    } catch (err) {
      job.status = "failed";
      job.error = err.message;
      writeJobFile(jobId, job);
      console.error(err.message);
      process.exit(1);
    }
  }
}

function cmdStatus(args) {
  const jobId = args.find(a => !a.startsWith("--"));
  const showAll = args.includes("--all");

  if (jobId) {
    const job = readJobFile(jobId);
    if (!job) {
      console.log(`Job not found: ${jobId}`);
      process.exit(1);
    }
    console.log(`Job: ${job.id}`);
    console.log(`Type: ${job.type}`);
    console.log(`Status: ${job.status}`);
    console.log(`Created: ${job.createdAt}`);
    if (job.completedAt) console.log(`Completed: ${job.completedAt}`);
    if (job.prompt) console.log(`Task: ${job.prompt}`);
    if (job.error) console.log(`Error: ${job.error}`);
    return;
  }

  const jobs = listJobs().slice(0, showAll ? 50 : 10);
  if (jobs.length === 0) {
    console.log("No jobs found.");
    return;
  }

  console.log(`Recent jobs (${jobs.length}):\n`);
  for (const job of jobs) {
    const icon = job.status === "running" ? "🔄" : job.status === "completed" ? "✅" : "❌";
    console.log(`${icon} ${job.id}  ${job.type}  ${job.status}  ${job.createdAt}`);
  }
}

function cmdResult(args) {
  const jobId = args[0];
  if (!jobId) {
    const jobs = listJobs();
    const latest = jobs.find(j => j.status === "completed");
    if (!latest) {
      console.log("No completed jobs found.");
      return;
    }
    printJobResult(latest);
    return;
  }

  const job = readJobFile(jobId);
  if (!job) {
    console.log(`Job not found: ${jobId}`);
    process.exit(1);
  }
  printJobResult(job);
}

function printJobResult(job) {
  console.log(`Job: ${job.id}`);
  console.log(`Type: ${job.type}`);
  console.log(`Status: ${job.status}`);
  if (job.output) {
    console.log("\n--- Output ---\n");
    console.log(job.output);
  }
  if (job.error) {
    console.log("\n--- Error ---\n");
    console.log(job.error);
  }
}

function cmdCancel(args) {
  const jobId = args[0];
  if (!jobId) {
    console.log("Specify a job ID to cancel.");
    process.exit(1);
  }

  const job = readJobFile(jobId);
  if (!job) {
    console.log(`Job not found: ${jobId}`);
    process.exit(1);
  }

  if (job.status !== "running") {
    console.log(`Job ${jobId} is not running (status: ${job.status})`);
    return;
  }

  if (job.pid) {
    try {
      process.kill(job.pid, "SIGTERM");
    } catch {}
  }

  job.status = "cancelled";
  job.completedAt = new Date().toISOString();
  writeJobFile(jobId, job);
  console.log(`Cancelled: ${jobId}`);
}

// --- Main ---

const [,, command, ...args] = process.argv;

switch (command) {
  case "setup":
    await cmdSetup(args);
    break;
  case "review":
    await cmdReview(args);
    break;
  case "rescue":
  case "task":
    await cmdRescue(args);
    break;
  case "status":
    cmdStatus(args);
    break;
  case "result":
    cmdResult(args);
    break;
  case "cancel":
    cmdCancel(args);
    break;
  default:
    console.log("Usage: mimo-companion.mjs <command> [args]");
    console.log("");
    console.log("Commands:");
    console.log("  setup [--json]         Check MiMo availability");
    console.log("  review [--background]  Run code review");
    console.log("  rescue [task]          Delegate task to MiMo");
    console.log("  status [job-id]        Show job status");
    console.log("  result [job-id]        Show job result");
    console.log("  cancel [job-id]        Cancel a running job");
    process.exit(1);
}
