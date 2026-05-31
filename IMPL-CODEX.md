# Codex Implementation

## Entrypoint

`.codex/hooks.json` — registers `UserPromptSubmit` hook event pointing to `.codex/lang-tutor/hook.py`

## Core concept: Codex hooks (not JS/TS plugins)

Codex extensibility uses a **hooks** framework — subprocess commands that run on lifecycle events. This is fundamentally different from OpenCode's SDK-based plugin system.

Key differences from OpenCode:
- **No JS/TS runtime**: Hook scripts are external commands (Python in our case), not loaded modules
- **No SDK access**: No `ctx.client`, no `session.prompt()`, no `tui.showToast()` — only stdin/stdout/stderr
- **Every invocation is a fresh process**: No shared memory — state must be filesystem-based
- **Display via stderr ANSI**: Temporary terminal UI, not persistent conversation messages

## Hook event: UserPromptSubmit

Fires synchronously when the user submits a prompt. Codex passes the prompt and session context via stdin as JSON, then reads stdout JSON for the response.

### stdin fields used

| Field | Type | Source |
|-------|------|--------|
| `prompt` | string | User's raw input text |
| `session_id` | string | Current session identifier |
| `model` | string | Active model slug |

### stdout response

Always `{"continue": true}`. The hook never blocks the prompt.

When a tip is produced, also includes `systemMessage` — surfaced as a transient UI warning, not a conversation message.

```json
{"continue": true}
// or
{"continue": true, "systemMessage": "[Lang-Tip] Use 'implement' instead of 'actualize'."}
```

## Hook script

`.codex/lang-tutor/hook.py` — Python 3 stdlib, zero dependencies.

### Pipeline

```
stdin JSON → parse prompt
    ↓
Strip code blocks (```...``` → [CODE BLOCK], `code` → [CODE])
    ↓
Read config.json (live — every invocation)
    ↓
[Gate: enabled?]  [Gate: cooldown?]
    ↓
Resolve LLM config from Codex TOML files
  (scans project .codex/config.toml → ~/.codex/config.toml → ~/.codex/*.config.toml)
    ↓
Build system prompt (base, forcedLanguage, or nativeLanguage variant)
    ↓
fetch_tip(): POST /chat/completions with the session's provider + model
    ↓
[Gate: response is [OK]?] → nothing shown
    ↓
ANSI toast on stderr (auto-clears after toastDurationMs)
  stdout: {"continue": true, "systemMessage": "[Lang-Tip] ..."}
```

### State management

Since every hook invocation is a fresh process, shared state uses files in `/tmp/`:

| State | File | Purpose |
|-------|------|---------|
| Cooldown | `/tmp/lang-tutor-cooldown-{session_id}` | Timestamp of last tip, per-session |
| Logging | `/tmp/lang-tutor-{session_id}.log` | Diagnostic log, per-session |

All paths incorporate `session_id` from the hook input to prevent interference between concurrent Codex processes.

## Config

`.codex/lang-tutor/config.json` — live-read on every invocation, no restart needed.

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

See [README.md#Configuration-Codex](./README.md#configuration-codex) for the full option reference.

## LLM config resolution

The hook auto-discovers the active LLM provider config by scanning Codex config files in merge order:

1. **Project** `.codex/config.toml`
2. **User** `~/.codex/config.toml`
3. **Profile** `~/.codex/*.config.toml` (e.g. `cliproxyapi.config.toml`)

`model_providers` sections are merged, later overwriting earlier. The active `model_provider` name is resolved to its `base_url` and `env_key`, and the API key is read from the corresponding environment variable.

The model name used for tips is resolved by priority:
1. `tipModel` from config.json (if set)
2. `model` from hook stdin (session's active model)
3. `model` from Codex TOML config (fallback)

## Display

Tips are shown via **ANSI terminal escape sequences** on stderr:

```
\n\x1b[S                     # Scroll up to make room
\x1b[1G\x1b[33m✨ [Lang-Tip]: ...  # Yellow text at line start
time.sleep(toastDurationMs / 1000)
\x1b[1G\x1b[2K               # Clear the line
```

This creates a temporary yellow notification bar that auto-clears after the configured duration. It never enters the conversation transcript.

Additionally, `systemMessage` on stdout triggers Codex's native UI notification system — also transient, not conversation.

## Conversation safety (zero pollution)

| Output channel | Content | Enters conversation? |
|---------------|---------|---------------------|
| stdout | `{"continue": true}` | ❌ — hook return value |
| stdout | `systemMessage` | ❌ — UI warning, not transcript |
| stderr | ANSI toast | ❌ — terminal ephemeral display |
| /tmp | Log file | ❌ — filesystem, not visible to user |

No `session.prompt()`, no message mutations, no prompt rewriting — the hook reads the prompt, never modifies it.

## First-time setup

The hook requires trust before it can run. Start Codex in the project directory:

1. Codex warns "hooks need review"
2. Type `/hooks` to open the hooks manager
3. Find the `lang-tutor` hook entry and select **Trust Hook**

Or bypass interactively:

```bash
codex --dangerously-bypass-hook-trust
```

## Testing changes

1. Edit `.codex/lang-tutor/hook.py`, `.codex/lang-tutor/config.json`, or `.codex/hooks.json`
2. Test with direct stdin injection:

```bash
echo '{"prompt":"quiero creer un aplicativo","session_id":"test-001","model":"shangtang/deepseek-v4-flash"}' \
  | python3 .codex/lang-tutor/hook.py
```

3. Check logs: `cat /tmp/lang-tutor-{session_id}.log`
4. Restart Codex if hooks.json changed (Codex caches hook registrations at startup)

## Logging

Diagnostics go to `/tmp/lang-tutor-{session_id}.log` (per-session, same base path as OpenCode for consistency). Log levels: DEBUG, INFO, WARN, ERROR. File is appended to on every hook invocation.

## Key differences from OpenCode plugin

| Aspect | OpenCode | Codex |
|--------|----------|-------|
| Language | TypeScript | Python 3 stdlib |
| Runtime | bun/Node | Subprocess (any) |
| Hook mechanism | `chat.message` SDK hook | `UserPromptSubmit` CLI hook |
| LLM config | Read from opencode.json + env | Scan Codex TOML configs + env |
| Language detection | franc-min (JS library) | Delegated to LLM system prompt |
| Display | SDK `session.prompt()` or `tui.showToast()` | ANSI stderr escape sequences |
| State | In-memory Map (messageID, cooldown) | Filesystem `/tmp/` (per-session) |
| Config | In opencode.json plugin entry | Separate `.codex/lang-tutor/config.json` |
