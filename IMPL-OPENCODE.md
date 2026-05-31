# OpenCode Implementation

## Entrypoint

`.opencode/plugin/lang-tutor/index.ts` — exports `LangTutorPlugin: Plugin`

## Critical: hook system

Uses **`chat.message`** hook, which fires once per user message in a session. The hook provides the message content directly via `output.parts`.

```ts
return {
  "chat.message": async (input, output) => {
    // input: { sessionID, agent?, model?: { providerID, modelID }, messageID?, variant? }
    // output: { message: UserMessage, parts: Part[] }
    const userContent = output.parts
      .filter(p => p.type === "text" && !!p.text)
      .map(p => p.text)
      .join("")
  }
}
```

## Critical: message dedup

The `chat.message` hook should fire once per message, but a bounded `messageID` dedup cache (last 100 messageIDs per session) provides a safety net against duplicate processing.

```ts
const messageIDCache = new Map<string, string[]>() // sessionID → messageIDs[]
```

No unbounded `Set` — memory is strictly bounded.

## Critical: ISO 639 normalization

`nativeLanguages` and `forcedLanguage` accept both ISO 639-1 (`"en"`, `"es"`) and ISO 639-3 (`"eng"`, `"spa"`) codes, plus common English language names for `forcedLanguage` (`"Spanish"`). All values are normalized to ISO 639-3 at runtime before comparison with franc-min output.

```ts
normalizeTo6393("en")   // → "eng"
resolveForcedLanguageName("es") // → "Spanish"
normalizeNativeLanguages(["en", "zh", "eng"]) // → ["eng", "zho"]
```

## Config

Config is re-read from `opencode.json` on every message — supports live enable/disable without restart. Plugin path in config must be relative (`./.opencode/plugin/...`), never `file://` (hostname error on Linux).

Options: `enabled` (bool), `nativeLanguages` (ISO 639-1 or 639-3[]), `forcedLanguage` (ISO 639-1, 639-3, or language name), `cooldownMs` (number), `tipModel` (string), `displayMethod` (`"prompt"` or `"toast"`, default: `"prompt"`), `toastDurationMs` (number, default: `8000`), `mode` (`"sync"` or `"async"`, default: `"sync"`).

If `tipModel` is not set, falls back to `input.model.modelID` from the `chat.message` hook, then to the top-level `model` field in the config.

Example config:
```json
["./.opencode/plugin/lang-tutor/index.ts", {
  "enabled": true,
  "nativeLanguages": ["en", "zh"],
  "forcedLanguage": "es",
  "cooldownMs": 10000,
  "tipModel": "mango/deepseek-v4-pro",
  "displayMethod": "toast",
  "mode": "async"
}]
```

## Sync vs async mode

- **`mode: "sync"`** (default): The `chat.message` handler awaits the tip request before returning. Necessary for providers that only allow one request at a time (concurrency=1). The main AI response is delayed until the tip request completes.
- **`mode: "async"`**: The tip request is enqueued via `TipsQueue` and the hook returns immediately. The main AI starts responding right away. Tips arrive later as a background result.

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