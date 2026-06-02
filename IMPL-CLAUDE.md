# Claude Code — Lang-Tutor Implementation Guide

## Overview

Lang-tutor on Claude Code uses a **`UserPromptSubmit` command hook** — a Python 3 script that runs as a subprocess on every user message. It observes the prompt, calls an LLM for a writing-coach tip, and displays the tip without blocking or modifying the prompt.

## Files

| File | Purpose |
|------|---------|
| `.claude/lang-tutor/hook.py` | Main hook script (Python 3 stdlib, ~610 lines) |
| `.claude/lang-tutor/config.json` | User-facing configuration |
| `.claude/settings.local.json` | Hook registration (or `.claude/settings.json` for committed config) |

## Hook Registration

The hook is registered on the `UserPromptSubmit` event in `.claude/settings.local.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3",
            "args": ["${CLAUDE_PROJECT_DIR}/.claude/lang-tutor/hook.py"],
            "timeout": 15
          }
        ]
      }
    ]
  }
}
```

- Uses **exec form** (`python3` + `args`) to avoid shell quoting issues
- Timeout is 15 seconds (the LLM call typically takes 300-800ms)
- The hook never blocks the prompt — it always exits 0 with the prompt passed through

## Configuration

Config lives at `.claude/lang-tutor/config.json`:

```json
{
  "enabled": true,
  "nativeLanguages": [],
  "forcedLanguage": null,
  "cooldownMs": 10000,
  "tipModel": null,
  "displayMethod": "stderr",
  "toastDurationMs": 5000,
  "mode": "sync",
  "baseUrl": null,
  "wireApi": null
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Master switch |
| `nativeLanguages` | string[] | `[]` | ISO language codes where no tips are shown |
| `forcedLanguage` | string|null | `null` | Force coaching in a specific language (ISO code or name) |
| `cooldownMs` | integer | `10000` | Min ms between tip displays |
| `tipModel` | string|null | `null` | Override LLM model (default: `claude-sonnet-4-6`) |
| `displayMethod` | string | `"stderr"` | `"stderr"` or `"systemMessage"` |
| `toastDurationMs` | integer | `5000` | Stderr toast display duration (sync mode) |
| `mode` | string | `"sync"` | `"sync"` (blocking, auto-clear) or `"async"` (non-blocking, persistent) |
| `baseUrl` | string|null | `null` | Override API base URL |
| `wireApi` | string|null | `null` | `"messages"` (Anthropic) or `"chat"` (OpenAI-compatible) |

## LLM Config Resolution

Credentials are resolved in priority order:

1. `.claude/settings.json` — project-level (`langTutor.apiKey`, `langTutor.baseUrl`, etc.)
2. `~/.claude/settings.json` — user-level
3. `ANTHROPIC_AUTH_TOKEN` environment variable
4. `ANTHROPIC_API_KEY` environment variable
5. Built-in defaults: `api.anthropic.com`, model `claude-sonnet-4-6`

If `tipModel` is set in the hook config, it overrides the resolved model.

If no credentials are found, the hook silently passes the prompt through (no tip, no error).

## Display Methods

### stderr (default)

ANSI yellow bar with sparkle emoji, written to stderr:

- **Sync mode**: Tip appears → process sleeps `toastDurationMs` → line is cleared → exit
- **Async mode**: Tip appears immediately → process exits without clearing (tip persists in terminal scrollback)

### systemMessage

Stdout JSON output:

```json
{"continue": true, "systemMessage": "[Lang-Tip] ..."}
```

Shown as a persistent system notification. Mode (sync/async) does not affect behavior.

## How It Works

1. Claude Code fires `UserPromptSubmit` hook with stdin JSON containing `prompt`, `session_id`, `cwd`
2. Hook script reads stdin, loads config, checks cooldown
3. Strips code blocks (fenced + inline) from the prompt text
4. Calls the LLM (Anthropic Messages API by default) with a writing-coach system prompt
5. If LLM returns a tip (not `[OK]`), displays it via the configured method
6. Always exits 0 with the original prompt on stdout — never blocks or modifies

## State Management

- **Cooldown**: `/tmp/lang-tutor-cooldown-{session_id}` — Unix timestamp in ms
- **Logs**: `/tmp/lang-tutor-{session_id}.log` — auto-rotated at 5MB

## Dependencies

- Python 3 stdlib only (`json`, `os`, `sys`, `re`, `time`, `urllib`, `pathlib`, `threading`)
- No external packages required
