---
name: mimo-jobs
description: "Manage MiMo background jobs — check status, get results, or cancel running jobs. Use when the user wants to see job progress, retrieve output, or stop a job."
---

# MiMo Jobs

Manage MiMo background jobs.

## When to Use

- User wants to check running or recent MiMo jobs
- User wants to see the result of a completed job
- User wants to cancel a running job

## Commands

### Check Status

```bash
PLUGIN_ROOT="${CODEX_PLUGIN_ROOT:-}"
if [ -z "$PLUGIN_ROOT" ]; then
  PLUGIN_ROOT="$(ls -dt "$HOME/.codex/plugins/cache/mimo-code/mimo"/* 2>/dev/null | head -1)"
fi
node "$PLUGIN_ROOT/scripts/mimo-companion.mjs" status [job-id] [--all] [--json]
```

Shows running and recent jobs. Use `--all` to show more jobs, `--json` for structured output.

### Get Result

```bash
node "$PLUGIN_ROOT/scripts/mimo-companion.mjs" result [job-id] [--json]
```

Shows the final output for a completed job. Without a job-id, shows the latest completed job.

### Cancel Job

```bash
node "$PLUGIN_ROOT/scripts/mimo-companion.mjs" cancel <job-id>
```

Cancels an active background job.

## Examples

```bash
# Show recent jobs
node "$PLUGIN_ROOT/scripts/mimo-companion.mjs" status

# Show specific job
node "$PLUGIN_ROOT/scripts/mimo-companion.mjs" status task-abc123

# Get latest result
node "$PLUGIN_ROOT/scripts/mimo-companion.mjs" result

# Cancel a job
node "$PLUGIN_ROOT/scripts/mimo-companion.mjs" cancel task-abc123
```

## Output

All output is returned verbatim. Do not paraphrase or add commentary.
