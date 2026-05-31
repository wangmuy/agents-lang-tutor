# agents-lang-tutor

A language writing-tutor plugin for coding agents. After each user message, it detects the language and provides a brief grammar or vocabulary tip — helping users improve their writing in any language while they code.

## How it works

1. On each user message, the plugin detects the language (via LLM for Codex, via fran­c-min for OpenCode)
2. Strips code blocks/inline code so language detection focuses on natural text
3. Sends the text to an LLM configured as a writing coach
4. If the LLM finds an issue, displays a short tip (<25 words) via toast or inline prompt
5. If the text is fine, the LLM responds `[OK]` and nothing is shown

## Supported agents

| Agent | Directory | Status |
|-------|-----------|--------|
| OpenCode | `.opencode/plugin/lang-tutor/` | Implemented |
| Codex | `.codex/lang-tutor/` | Implemented |
| Claude Code | `.claude/` | Planned |
| pi | TBD | Planned |

Each agent gets a self-contained plugin adapted to its hook/plugin system. See [IMPL-OPENCODE.md](./IMPL-OPENCODE.md) for the OpenCode implementation guide.

## Configuration (OpenCode)

Add to `opencode.json`:

```json
{
  "plugin": [
    ["./.opencode/plugin/lang-tutor/index.ts", {
      "enabled": true,
      "nativeLanguages": ["en", "zh"],
      "forcedLanguage": "es",
      "cooldownMs": 10000,
      "tipModel": "mango/deepseek-v4-pro",
      "displayMethod": "toast",
      "mode": "sync"
    }]
  ]
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | bool | `true` | Enable/disable the plugin (live, no restart needed) |
| `nativeLanguages` | string[] | `[]` | Languages the user already knows well — tips are skipped for these. Accepts ISO 639-1 (`"en"`, `"es"`) or ISO 639-3 (`"eng"`, `"spa"`). Both formats work; values are normalized internally. |
| `forcedLanguage` | string | — | Always coach in this language. Accepts ISO 639-1 (`"es"`), ISO 639-3 (`"spa"`), or language names (`"Spanish"`). All produce the same result. |
| `cooldownMs` | number | — | Minimum ms between tips in the same session |
| `tipModel` | string | hook model | Model to use for coaching tips (falls back to the session's active model from the `chat.message` hook, then to top-level `model` if unset) |
| `displayMethod` | `"prompt"` or `"toast"` | `"prompt"` | How to display tips: inline in agent stream, or as a toast notification |
| `toastDurationMs` | number | `8000` | Duration in ms for toast notifications (only applies when `displayMethod` is `"toast"`). Default 8 seconds. |
| `mode` | `"sync"` or `"async"` | `"sync"` | `sync` awaits the tip request before returning (needed for providers with concurrency=1); `async` fires tip in background |

The plugin re-reads config on every message, so you can toggle `enabled` without restarting.

Plugin path must be relative (`./.opencode/plugin/...`), not `file://` — absolute `file://` paths cause a hostname error on Linux.

## Configuration (Codex)

Uses Codex's [hooks](https://developers.openai.com/codex/hooks) framework. The hook is registered in `.codex/hooks.json` and fires on every `UserPromptSubmit` event.

### Files

| File | Purpose |
|------|---------|
| `.codex/hooks.json` | Declares the `UserPromptSubmit` hook binding |
| `.codex/lang-tutor/hook.py` | Hook script — stdlib Python, no dependencies |
| `.codex/lang-tutor/config.json` | Runtime configuration (live-read) |

### Config options

Edit `.codex/lang-tutor/config.json`:

```json
{
  "enabled": true,
  "nativeLanguages": [],
  "forcedLanguage": null,
  "cooldownMs": 10000,
  "tipModel": null,
  "displayMethod": "toast",
  "toastDurationMs": 5000,
  "mode": "sync"
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | bool | `true` | Enable/disable the hook (live, no restart needed) |
| `nativeLanguages` | string[] | `[]` | ISO 639-1 or 639-3 codes. Tips are suppressed for detected native languages. Ex: `["en", "zh"]` |
| `forcedLanguage` | string \| null | `null` | Always coach in this language (ISO 639-1, 639-3, or name like `"Spanish"`) |
| `cooldownMs` | number | `10000` | Minimum ms between tips (10s default). Per-session via `/tmp/lang-tutor-cooldown-{session_id}`. Set to `0` for no cooldown |
| `tipModel` | string \| null | `null` | Model name override for tips. Uses same provider as session. Falls back to session model if unset |
| `displayMethod` | `"toast"` | `"toast"` | Toast via ANSI terminal escape. `"prompt"` accepted but falls back to toast (no SDK access from subprocess hook) |
| `toastDurationMs` | number | `5000` | How long the ANSI toast stays visible on screen |
| `mode` | `"sync"` | `"sync"` | Accepted for config portability. `"async"` silently treated as sync (Codex runtime doesn't support async hooks yet) |

### How it works

```
User types prompt → UserPromptSubmit hook fires
  ├─ hook.py reads config.json (live)
  ├─ Strips ```blocks``` and `inline code` from prompt
  ├─ Calls the same LLM your Codex session uses (same provider, model, API key)
  ├─ LLM responds: "Use 'implement' instead of 'actualize'" or just "[OK]"
  ├─ Tips shown as: ✨ [Lang-Tip]: ...  (temporary, auto-clears in N seconds)
  └─ Prompt is never blocked or modified — conversation history stays clean
```

### First-time setup

The hook requires trust before it can run. When you start Codex in this project:

1. Codex will warn that hooks need review
2. Type `/hooks` to open the hooks manager
3. Find the `lang-tutor` hook entry and select **Trust Hook**

Or skip the interactive trust flow with:

```bash
codex --dangerously-bypass-hook-trust
```

### Logs

Diagnostics go to `/tmp/lang-tutor-{session_id}.log` (per-session). Uses the same base path as OpenCode for consistency.

## Adding a new agent

For each new agent, create a directory following that agent's plugin conventions. Key decisions:

- **Hook:** which hook/event fires for user messages?
- **Message text:** how to retrieve it (event payload vs API fetch)?
- **Display:** how to show output inline to the user?
- **LLM config:** how to access the agent's active model, provider, and API key?

## Development

- No build step — agents load TypeScript/JavaScript directly
- Logs go to `/tmp/lang-tutor.log` (auto-rotated at 5MB)
- See [AGENTS.md](./AGENTS.md) for implementation details and constraints

## License

```
Copyright 2026 wangmuy

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
