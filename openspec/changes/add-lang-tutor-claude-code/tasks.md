## 1. Config File and Directory Setup
Traceability: [REQ-002]

- [x] 1.1 Create `.claude/lang-tutor/` directory structure
  Blast Radius: `[".claude/lang-tutor/*"]`
  DoD:
    - [x] Directory exists at `.claude/lang-tutor/`

- [x] 1.2 Create `.claude/lang-tutor/config.json` with default configuration
  Blast Radius: `[".claude/lang-tutor/config.json"]`
  DoD:
    - [x] Config file exists with all default fields: enabled, nativeLanguages, forcedLanguage, cooldownMs, tipModel, displayMethod, toastDurationMs, mode, baseUrl, wireApi
    - [x] Config is valid JSON
    - [x] Field types and values match spec defaults

## 2. Hook Registration
Traceability: [REQ-002]

- [x] 2.1 Add hook registration to `.claude/settings.local.json`
  Blast Radius: `[".claude/settings.local.json", ".claude/settings.json"]`
  DoD:
    - [x] Hook is registered on UserPromptSubmit event
    - [x] Hook uses exec form: `python3` with `args` containing script path
    - [x] Timeout is set to 15 seconds
    - [x] Hook script path uses `${CLAUDE_PROJECT_DIR}` placeholder

## 3. Core Hook Script — Config Loading
Traceability: [REQ-002]

- [x] 3.1 Implement config file parsing in hook.py
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [x] Script reads `.claude/lang-tutor/config.json` relative to CLAUDE_PROJECT_DIR
    - [x] Missing config file falls back to defaults (no error)
    - [x] Malformed JSON falls back to defaults and logs the error
    - [x] `enabled: false` causes silent skip (no LLM call)
    - [x] All config fields have correct defaults as specified in the schema

- [x] 3.2 Implement ISO 639 code normalization (port from OpenCode)
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [x] ISO 639-1 to 639-3 mapping table is present
    - [x] ISO 639-3 to name mapping table is present
    - [x] `normalize_to_6393()` handles 2-letter and 3-letter codes
    - [x] `resolve_forced_language_name()` accepts codes and language names

## 4. Core Hook Script — LLM Config Resolution
Traceability: [REQ-003]

- [x] 4.1 Implement LLM credential resolution
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [x] Reads `.claude/settings.json` and `~/.claude/settings.json` for `langTutor` config
    - [x] Checks `ANTHROPIC_AUTH_TOKEN` environment variable
    - [x] Checks `ANTHROPIC_API_KEY` environment variable
    - [x] Respects priority order: settings > AUTH_TOKEN > API_KEY
    - [x] Falls back silently if no credentials found

- [x] 4.2 Implement default LLM config
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [x] Default base URL is `https://api.anthropic.com`
    - [x] Default model is `claude-sonnet-4-6` (when tipModel not specified)
    - [x] Default wire format is Anthropic Messages API
    - [x] `tipModel` in config overrides the resolved model

## 5. Core Hook Script — Code Block Stripping
Traceability: [REQ-001]

- [x] 5.1 Implement code block stripping function
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [x] Fenced code blocks (triple backticks) are replaced with `[CODE BLOCK]`
    - [x] Inline code (single backticks) are replaced with `[CODE]`
    - [x] Plain text passes through unchanged
    - [x] Empty input is handled gracefully
    - [x] Code blocks at start/end of text are handled
    - [x] Multiple code blocks are all stripped

## 6. Core Hook Script — LLM API Call
Traceability: [REQ-001]

- [x] 6.1 Implement Anthropic Messages API call
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [x] Sends POST to `/v1/messages` with correct Anthropic wire format
    - [x] Includes `x-api-key` header for ANTHROPIC_API_KEY
    - [x] Includes `Authorization: Bearer` header for ANTHROPIC_AUTH_TOKEN
    - [x] System prompt instructs writing-coach behavior (detect language, tip under 25 words, [OK] for no issues)
    - [x] Temperature is 0.3, max_tokens is 200
    - [x] Handles HTTP errors gracefully (logs and returns None)
    - [x] Handles timeout gracefully
    - [x] Parses response content correctly
    - [x] Detects `[OK]` response (including with additional text after [OK])

- [x] 6.2 Implement fallback for wire format (optional)
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [x] When `wireApi` is `"chat"`, sends to `/v1/chat/completions` with OpenAI-compatible format
    - [x] Uses `Authorization: Bearer` header
    - [x] Same temperature/max_tokens behavior as Messages API

## 7. Core Hook Script — Display Methods
Traceability: [REQ-004]

- [x] 7.1 Implement stderr display (sync mode)
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [x] Writes ANSI yellow text with sparkle emoji prefix to stderr
    - [x] Tip is truncated to 80 characters for display
    - [x] Sleeps for `toastDurationMs` before clearing
    - [x] Clears the line with ANSI erase sequence
    - [x] Original prompt is written to stdout immediately (before sleep)
    - [x] Exits 0

- [x] 7.2 Implement stderr display (async mode)
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [x] Writes ANSI yellow text to stderr
    - [x] Does NOT sleep or clear the line
    - [x] Writes original prompt to stdout
    - [x] Exits 0

- [x] 7.3 Implement systemMessage display
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [x] Outputs `{"continue": true, "systemMessage": "[Lang-Tip] ..."}` on stdout
    - [x] Tip is truncated to 200 characters
    - [x] Mode (sync/async) does not change behavior
    - [x] Exits 0

## 8. Core Hook Script — State Management
Traceability: [REQ-005]

- [x] 8.1 Implement cooldown
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [x] Reads cooldown timestamp from `/tmp/lang-tutor-cooldown-{session_id}`
    - [x] Skips LLM call if cooldown has not expired (difference < cooldownMs)
    - [x] Updates cooldown file timestamp after each tip display
    - [x] Cooldown file contains Unix timestamp in milliseconds
    - [x] Falls back gracefully if cooldown file is missing or corrupt

- [x] 8.2 Implement logging
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [x] Logs to `/tmp/lang-tutor-{session_id}.log`
    - [x] Log entries include timestamp, level, and message
    - [x] Rotates log file at 5MB (renames to `.log.old`)
    - [x] Errors are logged before silent fallback

## 9. Core Hook Script — Main Entry Point
Traceability: [REQ-001], [REQ-002], [REQ-003], [REQ-004], [REQ-005]

- [x] 9.1 Implement main() function and wire everything together
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [x] Reads stdin JSON and extracts `prompt` and `session_id`
    - [x] Exits 0 immediately if no prompt or session_id
    - [x] Applies cooldown check before LLM call
    - [x] Strips code blocks before sending to LLM
    - [x] Calls LLM with writing-coach system prompt
    - [x] Displays tip or passes silently on [OK]
    - [x] Always writes original prompt to stdout
    - [x] Under 600 lines total
    - [x] No external Python packages used (stdlib only)

## 10. Documentation Updates
Traceability: [REQ-001]

- [x] 10.1 Update AGENTS.md to mark Claude Code as "Implemented"
  Blast Radius: `["AGENTS.md"]`
  DoD:
    - [x] Claude Code row in agent table shows "Implemented" status
    - [x] Claude Code section added with implementation guide link

- [x] 10.2 Create IMPL-CLAUDE.md implementation guide
  Blast Radius: `["IMPL-CLAUDE.md"]`
  DoD:
    - [x] Documents hook registration (UserPromptSubmit event)
    - [x] Documents config file location and schema
    - [x] Documents display methods and modes
    - [x] Documents LLM config resolution priority
    - [x] Documents env vars required
    - [x] References AGENTS.md, README.md