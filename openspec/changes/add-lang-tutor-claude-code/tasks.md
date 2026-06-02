## 1. Config File and Directory Setup
Traceability: [REQ-002]

- [x] 1.1 Create `.claude/lang-tutor/` directory structure
  Blast Radius: `[".claude/lang-tutor/*"]`
  DoD:
    - [ ] Directory exists at `.claude/lang-tutor/`

- [x] 1.2 Create `.claude/lang-tutor/config.json` with default configuration
  Blast Radius: `[".claude/lang-tutor/config.json"]`
  DoD:
    - [ ] Config file exists with all default fields: enabled, nativeLanguages, forcedLanguage, cooldownMs, tipModel, displayMethod, toastDurationMs, mode, baseUrl, wireApi
    - [ ] Config is valid JSON
    - [ ] Field types and values match spec defaults

## 2. Hook Registration
Traceability: [REQ-002]

- [x] 2.1 Add hook registration to `.claude/settings.local.json`
  Blast Radius: `[".claude/settings.local.json", ".claude/settings.json"]`
  DoD:
    - [ ] Hook is registered on UserPromptSubmit event
    - [ ] Hook uses exec form: `python3` with `args` containing script path
    - [ ] Timeout is set to 15 seconds
    - [ ] Hook script path uses `${CLAUDE_PROJECT_DIR}` placeholder

## 3. Core Hook Script — Config Loading
Traceability: [REQ-002]

- [x] 3.1 Implement config file parsing in hook.py
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [ ] Script reads `.claude/lang-tutor/config.json` relative to CLAUDE_PROJECT_DIR
    - [ ] Missing config file falls back to defaults (no error)
    - [ ] Malformed JSON falls back to defaults and logs the error
    - [ ] `enabled: false` causes silent skip (no LLM call)
    - [ ] All config fields have correct defaults as specified in the schema

- [x] 3.2 Implement ISO 639 code normalization (port from OpenCode)
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [ ] ISO 639-1 to 639-3 mapping table is present
    - [ ] ISO 639-3 to name mapping table is present
    - [ ] `normalize_to_6393()` handles 2-letter and 3-letter codes
    - [ ] `resolve_forced_language_name()` accepts codes and language names

## 4. Core Hook Script — LLM Config Resolution
Traceability: [REQ-003]

- [x] 4.1 Implement LLM credential resolution
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [ ] Reads `.claude/settings.json` and `~/.claude/settings.json` for `langTutor` config
    - [ ] Checks `ANTHROPIC_AUTH_TOKEN` environment variable
    - [ ] Checks `ANTHROPIC_API_KEY` environment variable
    - [ ] Respects priority order: settings > AUTH_TOKEN > API_KEY
    - [ ] Falls back silently if no credentials found

- [x] 4.2 Implement default LLM config
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [ ] Default base URL is `https://api.anthropic.com`
    - [ ] Default model is `claude-sonnet-4-6` (when tipModel not specified)
    - [ ] Default wire format is Anthropic Messages API
    - [ ] `tipModel` in config overrides the resolved model

## 5. Core Hook Script — Code Block Stripping
Traceability: [REQ-001]

- [x] 5.1 Implement code block stripping function
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [ ] Fenced code blocks (triple backticks) are replaced with `[CODE BLOCK]`
    - [ ] Inline code (single backticks) are replaced with `[CODE]`
    - [ ] Plain text passes through unchanged
    - [ ] Empty input is handled gracefully
    - [ ] Code blocks at start/end of text are handled
    - [ ] Multiple code blocks are all stripped

## 6. Core Hook Script — LLM API Call
Traceability: [REQ-001]

- [x] 6.1 Implement Anthropic Messages API call
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [ ] Sends POST to `/v1/messages` with correct Anthropic wire format
    - [ ] Includes `x-api-key` header for ANTHROPIC_API_KEY
    - [ ] Includes `Authorization: Bearer` header for ANTHROPIC_AUTH_TOKEN
    - [ ] System prompt instructs writing-coach behavior (detect language, tip under 25 words, [OK] for no issues)
    - [ ] Temperature is 0.3, max_tokens is 200
    - [ ] Handles HTTP errors gracefully (logs and returns None)
    - [ ] Handles timeout gracefully
    - [ ] Parses response content correctly
    - [ ] Detects `[OK]` response (including with additional text after [OK])

- [x] 6.2 Implement fallback for wire format (optional)
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [ ] When `wireApi` is `"chat"`, sends to `/v1/chat/completions` with OpenAI-compatible format
    - [ ] Uses `Authorization: Bearer` header
    - [ ] Same temperature/max_tokens behavior as Messages API

## 7. Core Hook Script — Display Methods
Traceability: [REQ-004]

- [x] 7.1 Implement stderr display (sync mode)
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [ ] Writes ANSI yellow text with sparkle emoji prefix to stderr
    - [ ] Tip is truncated to 80 characters for display
    - [ ] Sleeps for `toastDurationMs` before clearing
    - [ ] Clears the line with ANSI erase sequence
    - [ ] Original prompt is written to stdout immediately (before sleep)
    - [ ] Exits 0

- [x] 7.2 Implement stderr display (async mode)
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [ ] Writes ANSI yellow text to stderr
    - [ ] Does NOT sleep or clear the line
    - [ ] Writes original prompt to stdout
    - [ ] Exits 0

- [x] 7.3 Implement systemMessage display
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [ ] Outputs `{"continue": true, "systemMessage": "[Lang-Tip] ..."}` on stdout
    - [ ] Tip is truncated to 200 characters
    - [ ] Mode (sync/async) does not change behavior
    - [ ] Exits 0

## 8. Core Hook Script — State Management
Traceability: [REQ-005]

- [x] 8.1 Implement cooldown
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [ ] Reads cooldown timestamp from `/tmp/lang-tutor-cooldown-{session_id}`
    - [ ] Skips LLM call if cooldown has not expired (difference < cooldownMs)
    - [ ] Updates cooldown file timestamp after each tip display
    - [ ] Cooldown file contains Unix timestamp in milliseconds
    - [ ] Falls back gracefully if cooldown file is missing or corrupt

- [x] 8.2 Implement logging
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [ ] Logs to `/tmp/lang-tutor-{session_id}.log`
    - [ ] Log entries include timestamp, level, and message
    - [ ] Rotates log file at 5MB (renames to `.log.old`)
    - [ ] Errors are logged before silent fallback

## 9. Core Hook Script — Main Entry Point
Traceability: [REQ-001], [REQ-002], [REQ-003], [REQ-004], [REQ-005]

- [x] 9.1 Implement main() function and wire everything together
  Blast Radius: `[".claude/lang-tutor/hook.py"]`
  DoD:
    - [ ] Reads stdin JSON and extracts `prompt` and `session_id`
    - [ ] Exits 0 immediately if no prompt or session_id
    - [ ] Applies cooldown check before LLM call
    - [ ] Strips code blocks before sending to LLM
    - [ ] Calls LLM with writing-coach system prompt
    - [ ] Displays tip or passes silently on [OK]
    - [ ] Always writes original prompt to stdout
    - [ ] Under 600 lines total
    - [ ] No external Python packages used (stdlib only)

## 10. Documentation Updates
Traceability: [REQ-001]

- [x] 10.1 Update AGENTS.md to mark Claude Code as "Implemented"
  Blast Radius: `["AGENTS.md"]`
  DoD:
    - [ ] Claude Code row in agent table shows "Implemented" status
    - [ ] Claude Code section added with implementation guide link

- [x] 10.2 Create IMPL-CLAUDE.md implementation guide
  Blast Radius: `["IMPL-CLAUDE.md"]`
  DoD:
    - [ ] Documents hook registration (UserPromptSubmit event)
    - [ ] Documents config file location and schema
    - [ ] Documents display methods and modes
    - [ ] Documents LLM config resolution priority
    - [ ] Documents env vars required
    - [ ] References AGENTS.md, README.md