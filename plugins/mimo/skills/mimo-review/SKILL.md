---
name: mimo-review
description: "Run a MiMo code review against local git state. Use when the user asks for a code review, wants to check code quality, or needs to review changes before shipping."
---

# MiMo Code Review

Run a MiMo review through the companion script.

## When to Use

- User asks for a code review
- User wants to check code quality before shipping
- User asks to review changes compared to a base branch

## How to Run

Execute the companion script with the `review` command:

```bash
node "<plugin-root>/scripts/mimo-companion.mjs" review [arguments]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `--base <ref>` | Compare against a specific git ref (branch, commit, tag) |
| `--background` | Run review in background |
| `--wait` | Run review in foreground (blocking) |

### Examples

```bash
# Review working tree changes
node "<plugin-root>/scripts/mimo-companion.mjs" review

# Review against main branch
node "<plugin-root>/scripts/mimo-companion.mjs" review --base main

# Review against a specific commit
node "<plugin-root>/scripts/mimo-companion.mjs" review --base abc1234
```

## Output

The review output is returned verbatim. Do not paraphrase, summarize, or add commentary.

## Constraints

- This is review-only. Do not fix issues or apply patches.
- If MiMo CLI is not installed, tell the user to run the setup skill first.
