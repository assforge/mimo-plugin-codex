---
name: mimo-setup
description: "Check whether MiMo CLI is installed and authenticated. Use when the user needs to verify MiMo availability or troubleshoot installation."
---

# MiMo Setup

Check MiMo CLI availability and authentication status.

## When to Use

- User asks to check if MiMo is installed
- User needs to verify MiMo authentication
- User is troubleshooting MiMo issues
- Before first use of other MiMo skills

## How to Run

Execute the companion script with the `setup` command:

```bash
PLUGIN_ROOT="${CODEX_PLUGIN_ROOT:-}"
if [ -z "$PLUGIN_ROOT" ]; then
  PLUGIN_ROOT="$(ls -dt "$HOME/.codex/plugins/cache/mimo-code/mimo"/* 2>/dev/null | head -1)"
fi
node "$PLUGIN_ROOT/scripts/mimo-companion.mjs" setup
```

## Output

The setup check output is returned verbatim.

## Troubleshooting

If MiMo is not found, tell the user to install it:

```bash
npm install -g mimocode
```

If MiMo is found but not authenticated, tell the user to run:

```bash
mimo providers
```
