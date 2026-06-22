---
name: mimo-rescue
description: "Delegate investigation, fixes, or follow-up work to MiMo. Use when the user wants to hand off a coding task, needs a second opinion, or wants MiMo to investigate an issue."
---

# MiMo Rescue

Delegate a task to MiMo for investigation or implementation.

## When to Use

- User wants to delegate a coding task to MiMo
- User needs a second opinion on an issue
- User wants MiMo to investigate a bug or failure
- User asks to fix something using MiMo

## How to Run

Execute the companion script with the `rescue` command:

```bash
PLUGIN_ROOT="${CODEX_PLUGIN_ROOT:-}"
if [ -z "$PLUGIN_ROOT" ]; then
  PLUGIN_ROOT="$(ls -dt "$HOME/.codex/plugins/cache/mimo-code/mimo"/* 2>/dev/null | head -1)"
fi
node "$PLUGIN_ROOT/scripts/mimo-companion.mjs" rescue [arguments] <task description>
```

### Arguments

| Argument | Description |
|----------|-------------|
| `--background` | Run task in background |
| `--wait` | Run task in foreground (blocking) |
| `--model <model>` | Specify MiMo model to use |

### Examples

```bash
# Delegate a fix task
node "$PLUGIN_ROOT/scripts/mimo-companion.mjs" rescue fix the failing test in auth.spec.ts

# Run investigation in background
node "$PLUGIN_ROOT/scripts/mimo-companion.mjs" rescue --background investigate why the build is failing

# Use specific model
node "$PLUGIN_ROOT/scripts/mimo-companion.mjs" rescue --model xiaomi/mimo-v2.5-pro review the security implications
```

## Output

The MiMo output is returned verbatim. Do not paraphrase, summarize, or add commentary.

## Job Tracking

Background jobs are tracked. Use the MiMo Jobs skill to check status or get results.
