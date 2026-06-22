---
name: mimo
description: "Use when the user invokes MiMo directly, says /mimo, asks to run MiMo, or wants MiMo to review, investigate, fix, check setup, or manage jobs."
---

# MiMo

Route direct MiMo requests to the companion script.

## Resolve Plugin Root

Use this shell prelude before every companion invocation:

```bash
PLUGIN_ROOT="${CODEX_PLUGIN_ROOT:-}"
if [ -z "$PLUGIN_ROOT" ]; then
  PLUGIN_ROOT="$(ls -dt "$HOME/.codex/plugins/cache/mimo-code/mimo"/* 2>/dev/null | head -1)"
fi
```

## Routing

- If the user asks for setup, installation status, auth status, or just says `/mimo`, run:

```bash
node "$PLUGIN_ROOT/scripts/mimo-companion.mjs" setup
```

- If the user asks for code review, run:

```bash
node "$PLUGIN_ROOT/scripts/mimo-companion.mjs" review [arguments]
```

- If the user asks MiMo to investigate, fix, implement, or give a second opinion, run:

```bash
node "$PLUGIN_ROOT/scripts/mimo-companion.mjs" rescue [arguments] <task description>
```

- If the user asks for job status, results, or cancellation, run the matching command:

```bash
node "$PLUGIN_ROOT/scripts/mimo-companion.mjs" status [job-id] [--all] [--json]
node "$PLUGIN_ROOT/scripts/mimo-companion.mjs" result [job-id] [--json]
node "$PLUGIN_ROOT/scripts/mimo-companion.mjs" cancel <job-id>
```

Return the MiMo output verbatim. Do not paraphrase or add commentary.
