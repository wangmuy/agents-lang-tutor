# AGENTS.md

## Purpose

See [README.md](./README.md) for project overview, usage, and configuration.

## Agent integration directories

| Agent | Directory | Status |
|-------|-----------|--------|
| OpenCode | `.opencode/plugin/` | Implemented |
| Codex | `.codex/lang-tutor/` | Implemented |
| Claude Code | `.claude/lang-tutor/` | Implemented |
| pi | TBD | Planned |

## Tooling

- **Target runtime:** each coding agent's built-in JS/TS runtime (bun for OpenCode, Node for Claude Code plugins) or Python (Claude Code hooks, Codex)
- **External dep:** `franc-min` for client-side language detection (ISO 639-3) in OpenCode only
- **LLM API:** varies per agent — OpenCode uses OpenAI-compatible `/chat/completions`, Codex uses Chat Completions or Responses API, Claude Code uses Anthropic Messages API by default
- **No build step** — agents load TypeScript/JavaScript directly; Python hooks have no build step
- **No test runner available** — bun not in PATH, no node test setup. Tests exist at `.opencode/plugin/lang-tutor/stripCodeBlocks.test.ts` but cannot be executed
- **Hook:** OpenCode uses `chat.message` hook (fires once per user message); Codex and Claude Code use `UserPromptSubmit`

## OpenCode

See [IMPL-OPENCODE.md](./IMPL-OPENCODE.md) for the full OpenCode implementation guide (hooks, SDK fetch, config, testing, display).

## Codex

Uses Codex's [hooks](https://developers.openai.com/codex/hooks) framework — specifically the `UserPromptSubmit` hook event. See [IMPL-CODEX.md](./IMPL-CODEX.md) for the full Codex implementation guide (hook registration, Python pipeline, LLM config resolution, ANSI toast display).

## Adding a new agent

See [README.md — Adding a new agent](./README.md#adding-a-new-agent) for the high-level guide. Implementation details per agent:

- Which hook/event fires for user messages?
- How to retrieve user message text (event payload vs API fetch)?
- How to display inline output to the user?
- How to access the agent's active LLM config (model, provider, API key)?

## Claude Code

See [IMPL-CLAUDE.md](./IMPL-CLAUDE.md) for the full Claude Code implementation guide (hook registration, config, display methods, LLM config resolution).
