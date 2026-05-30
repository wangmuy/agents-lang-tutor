# OpenCode Implementation

## Entrypoint

`.opencode/plugin/lang-tutor/index.ts` — exports `LangTutorPlugin: Plugin`

## Critical: hook system

Only the **`event`** hook fires. `chat.message` and `message.updated` hooks **never fire** in opencode v1.15.10.

```ts
return {
  event: async ({ event }) => {
    if (event.type !== "message.updated") return
    // Filter: user role, has summary (second fire post-assistant), not already processed
  }
}
```

Now uses `tool.execute.before` with sync/async mode support.

## Critical: getting user message content

Event payloads do **not** contain message text. Must fetch via SDK:

```ts
ctx.client.session.messages({ path: { id: sessionID } })
```

## Config

Config is re-read from `opencode.json` on every message — supports live enable/disable without restart. Plugin path in config must be relative (`./.opencode/plugin/...`), never `file://` (hostname error on Linux).

Options: `enabled` (bool), `nativeLanguages` (ISO 639-3[]), `forcedLanguage` (string), `cooldownMs` (number), `tipModel` (string), `displayMethod` (`"prompt"` or `"toast"`, default: `"prompt"`), `mode` (`"sync"` or `"async"`, default: `"sync"`).

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

## Testing changes

1. Edit `.opencode/plugin/lang-tutor/index.ts`
2. Restart opencode
3. Check: `tail -f /tmp/lang-tutor.log`

## Display

Tips are shown via `ctx.client.session.prompt({ noReply: true })` with `[LANG-TIP]` prefix. Appears in the agent's output stream. Toast via `ctx.client.tui.showToast({ body: { message, variant: "info" } })`.