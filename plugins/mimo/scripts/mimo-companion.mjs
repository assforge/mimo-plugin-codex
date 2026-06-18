#!/usr/bin/env node

/**
 * mimo-companion.mjs — Bridge between Claude Code plugin and MiMo CLI.
 *
 * Wraps `mimo run` to provide:
 *   - task delegation (foreground/background)
 *   - code review
 *   - status/result/cancel for background jobs
 *   - setup check
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const JOB_DIR = path.join(ROOT_DIR, ".jobs");

// --- Helpers ---

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

function checkMimoAvailable() {
  return new Promise((resolve) => {
    const child = spawn("mimo", ["--version"], { stdio: "pipe" });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

function runMimo(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("mimo", args, {
      stdio: opts.background ? "ignore" : "pipe",
      detached: opts.background,
      ...opts,
    });

    if (opts.background) {
      child.unref();
      resolve({ background: true, pid: child.pid });
      return;
    }

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

async function cmdSetup() {
  const available = await checkMimoAvailable();
  if (!available) {
    console.log("❌ MiMo CLI not found. Install with:");
    console.log("   npm install -g mimocode");
    console.log("   or: curl -fsSL https://mimo.xiaomi.com/install.sh | sh");
    process.exit(1);
  }

  const result = await runMimo(["run", "--help"]);
  console.log("✅ MiMo CLI is available");
  console.log("");
  console.log("Version check:");
  await runMimo(["--version"]).then(r => console.log(r.stdout.trim()));
  console.log("");
  console.log("MiMo plugin is ready. Use /mimo:rescue to delegate tasks.");
}

async function cmdReview(args) {
  const background = args.includes("--background");
  const wait = args.includes("--wait");
  const baseIdx = args.indexOf("--base");
  const base = baseIdx >= 0 ? args[baseIdx + 1] : null;

  // Build review prompt
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
    runMimo(mimoArgs, { background: true }).then(({ pid }) => {
      job.pid = pid;
      job.status = "completed";
      job.completedAt = new Date().toISOString();
      writeJobFile(jobId, job);
    }).catch((err) => {
      job.status = "failed";
      job.error = err.message;
      writeJobFile(jobId, job);
    });
    console.log(`📋 Review job started: ${jobId}`);
    console.log(`   Use /mimo:status ${jobId} to check progress`);
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

async function cmdRescue(args) {
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
    runMimo(mimoArgs, { background: true }).then(({ pid }) => {
      job.pid = pid;
      job.status = "completed";
      job.completedAt = new Date().toISOString();
      writeJobFile(jobId, job);
    }).catch((err) => {
      job.status = "failed";
      job.error = err.message;
      writeJobFile(jobId, job);
    });
    console.log(`🚀 Rescue job started: ${jobId}`);
    console.log(`   Task: ${taskText}`);
    console.log(`   Use /mimo:status ${jobId} to check progress`);
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
    // Show latest
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
    await cmdSetup();
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
    console.log("  setup                  Check MiMo availability");
    console.log("  review [--background]  Run code review");
    console.log("  rescue [task]          Delegate task to MiMo");
    console.log("  status [job-id]        Show job status");
    console.log("  result [job-id]        Show job result");
    console.log("  cancel [job-id]        Cancel a running job");
    process.exit(1);
}
