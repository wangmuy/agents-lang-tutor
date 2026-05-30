# OpenCode Implementation

## Entrypoint

`.opencode/plugin/lang-tutor/index.ts` — exports `LangTutorPlugin: Plugin`

## Critical: hook system

Uses **`tool.execute.before`** hook, which fires before each tool call in a session. The plugin reads the latest user message from the session via SDK fetch.

```ts
return {
  "tool.execute.before": async (input: { sessionID?: string }, _output: unknown) => {
    const sessionID = input.sessionID
    if (!sessionID) return
    // Re-read config, fetch messages, find latest user message, process tip
  }
}
```

The old `event` / `message.updated` / `chat.message` hooks never fired reliably in opencode v1.15.10, so the implementation migrated to `tool.execute.before`.

## Critical: getting user message content

Event payloads do **not** contain message text. Must fetch via SDK:

```ts
ctx.client.session.messages({ path: { id: sessionID } })
```

## Config

Config is re-read from `opencode.json` on every message — supports live enable/disable without restart. Plugin path in config must be relative (`./.opencode/plugin/...`), never `file://` (hostname error on Linux).

Options: `enabled` (bool), `nativeLanguages` (ISO 639-3[]), `forcedLanguage` (string), `cooldownMs` (number), `tipModel` (string), `displayMethod` (`"prompt"` or `"toast"`, default: `"prompt"`), `mode` (`"sync"` or `"async"`, default: `"sync"`).

If `tipModel` is not set, falls back to the top-level `model` field in the config.

Example config:
```json
["./.opencode/plugin/lang-tutor/index.ts", {
  "enabled": true,
  "nativeLanguages": ["eng"],
  "forcedLanguage": "es",
  "cooldownMs": 10000,
  "tipModel": "mango/deepseek-v4-pro",
  "displayMethod": "toast",
  "mode": "async"
}]
```

## Logging

Tips and diagnostics are written to `/tmp/lang-tutor.log` (or `os.tmpdir()/lang-tutor.log`). Log levels: DEBUG, INFO, WARN, ERROR. The file is automatically rotated when it exceeds 5MB (renamed to `.old`).

## LLM request details

- Sends `enable_thinking: false` by default to suppress reasoning/thinking output from models that support it
- If the reasoning-disabled request fails (non-OK HTTP or empty content), falls back to a reasoning-enabled request
- If response has `finish_reason: "length"` and empty content with reasoning present, retries with `max_tokens: 512` (up from 200)
- Uses `require("franc-min")` to load language detection; extracts `.franc` from the module export

## Testing changes

1. Edit `.opencode/plugin/lang-tutor/index.ts`
2. Restart opencode
3. Check: `tail -f /tmp/lang-tutor.log`

## Display

Tips are shown via `ctx.client.session.prompt({ noReply: true })` with `[LANG-TIP]` prefix. Appears in the agent's output stream. Toast via `ctx.client.tui.showToast({ body: { message, variant: "info", duration: 8000 } })`.