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

## OpenCode-specific implementation

**Entrypoint:** `.opencode/plugin/lang-tutor/index.ts` — exports `LangTutorPlugin: Plugin`

### Critical: hook system

Only the **`event`** hook fires. `chat.message` and `message.updated` hooks **never fire** in opencode v1.15.10.

```ts
return {
  event: async ({ event }) => {
    if (event.type !== "message.updated") return
    // Filter: user role, has summary (second fire post-assistant), not already processed
  }
}
```

### Critical: getting user message content

Event payloads do **not** contain message text. Must fetch via SDK:

```ts
ctx.client.session.messages({ path: { id: sessionID } })
```

### Config

Config is re-read from `opencode.json` on every message — supports live enable/disable without restart. Plugin path in config must be relative (`./.opencode/plugin/...`), never `file://` (hostname error on Linux).

Options: `enabled` (bool), `nativeLanguages` (ISO 639-3[]), `forcedLanguage` (string), `cooldownMs` (number), `tipModel` (string).

### Testing changes

1. Edit `.opencode/plugin/lang-tutor/index.ts`
2. Restart opencode
3. Check: `tail -f /tmp/lang-tutor.log`

### Display

Tips are shown via `ctx.client.session.prompt({ noReply: true })` with `[LANG-TIP]` prefix. Appears in the agent's output stream.

## Adding a new agent

For each new agent, create a directory following that agent's plugin conventions. Key decisions per agent:
- Which hook/event fires for user messages?
- How to retrieve user message text (event payload vs API fetch)?
- How to display inline output to the user?
- How to access the agent's active LLM config (model, provider, API key)?