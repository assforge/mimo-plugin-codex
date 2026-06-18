# MiMo Plugin for Codex

> **Attribution**: This plugin's structure is based on [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc) — the official Codex plugin. We adapted the `.codex-plugin/` format, `SKILL.md` conventions, and marketplace registration to work with [MiMo Code](https://mimo.xiaomi.com) (Xiaomi MiMo). The companion script validation logic is ported from Codex's `process.mjs` and `codex.mjs`.

Use MiMo Code from inside Codex for code reviews or to delegate tasks.

## What You Get

- **MiMo Review** — Run a MiMo code review on your current work
- **MiMo Rescue** — Delegate investigation or fix tasks to MiMo
- **MiMo Jobs** — Check status, get results, or cancel background jobs
- **MiMo Setup** — Verify MiMo CLI availability

## Requirements

- **MiMo CLI installed** (`npm install -g mimocode` or `curl -fsSL https://mimo.xiaomi.com/install.sh | sh`)
- **Node.js 18.18 or later**

## Install

Add the marketplace in Codex:

```
codex plugin marketplace add /Users/chomin/Documents/Source/mimo-plugin-codex
```

Install the plugin:

```
codex plugin add mimo@mimo-code
```

Then verify:

```
# In Codex, use the MiMo Setup skill
```

## Usage

### MiMo Review

Run a code review against your current git state.

```
# In Codex, trigger the MiMo Review skill:
"Review my code changes"
"Review changes compared to main"
```

### MiMo Rescue

Delegate a task to MiMo.

```
# In Codex, trigger the MiMo Rescue skill:
"Investigate why the tests are failing"
"Fix the build error in auth.ts"
"Review the security implications of this change"
```

### MiMo Jobs

Manage background jobs.

```
# In Codex, trigger the MiMo Jobs skill:
"Show my MiMo jobs"
"Get the result of the latest MiMo job"
"Cancel the running MiMo job"
```

### MiMo Setup

Check MiMo availability.

```
# In Codex, trigger the MiMo Setup skill:
"Check if MiMo is installed"
"Verify MiMo setup"
```

## Architecture

```
mimo-plugin-codex/
├── .codex-plugin/
│   └── marketplace.json        # Marketplace registration
└── plugins/mimo/
    ├── .codex-plugin/
    │   └── plugin.json         # Plugin metadata
    ├── skills/
    │   ├── mimo-review/
    │   │   └── SKILL.md        # Code review skill
    │   ├── mimo-rescue/
    │   │   └── SKILL.md        # Task delegation skill
    │   ├── mimo-setup/
    │   │   └── SKILL.md        # Setup check skill
    │   └── mimo-jobs/
    │       └── SKILL.md        # Job management skill
    ├── scripts/
    │   └── mimo-companion.mjs  # Bridge to mimo CLI
    └── assets/                 # Icons (optional)
```

## License

MIT
