# agents-lang-tutor

A language writing-tutor plugin for coding agents. After each user message, it detects the language and provides a brief grammar or vocabulary tip — helping users improve their writing in any language while they code.

## How it works

1. On each user message, the plugin detects the language using [franc-min](https://github.com/wooorm/franc) (ISO 639-3)
2. Strips code blocks/inline code so language detection focuses on natural text
3. Sends the text to an LLM configured as a writing coach
4. If the LLM finds an issue, displays a short tip (<25 words) via toast or inline prompt
5. If the text is fine, the LLM responds `[OK]` and nothing is shown

## Supported agents

| Agent | Directory | Status |
|-------|-----------|--------|
| OpenCode | `.opencode/plugin/lang-tutor/` | Implemented |
| Codex | `.codex/` | Planned |
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

