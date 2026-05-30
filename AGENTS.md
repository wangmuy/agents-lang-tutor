# AGENTS.md

## Purpose

A language writing-tutor plugin that provides brief grammar/vocabulary tips after each user message. Designed to run across multiple coding agents — currently implemented for OpenCode, with Codex, Claude Code, and pi planned.

## Agent integration directories

| Agent | Directory | Status |
|-------|-----------|--------|
| OpenCode | `.opencode/plugin/` | Implemented |
| Codex | `.codex/` | Planned |
| Claude Code | `.claude/` | Planned |
| pi | TBD | Planned |

Each agent gets its own plugin directory with a self-contained implementation adapted to that agent's plugin/hook system.

## Tooling

- **Target runtime:** each coding agent's built-in JS/TS runtime (bun for OpenCode, Node for Claude Code, etc.)
- **External dep:** `franc-min` for client-side language detection (ISO 639-3)
- **LLM API:** varies per agent — OpenCode uses OpenAI-compatible `/chat/completions`, Claude Code uses Anthropic Messages API, others TBD
- **No build step** — agents load TypeScript/JavaScript directly
- **No test runner available** — bun not in PATH, no node test setup. Tests exist at `.opencode/plugin/lang-tutor/stripCodeBlocks.test.ts` but cannot be executed
- **Hook:** OpenCode uses `tool.execute.before` (not `event` or `message.updated`, which don't fire reliably)

## OpenCode

See [IMPL-OPENCODE.md](./IMPL-OPENCODE.md) for the full OpenCode implementation guide (hooks, SDK fetch, config, testing, display).

## Adding a new agent

For each new agent, create a directory following that agent's plugin conventions. Key decisions per agent:
- Which hook/event fires for user messages?
- How to retrieve user message text (event payload vs API fetch)?
- How to display inline output to the user?
- How to access the agent's active LLM config (model, provider, API key)?