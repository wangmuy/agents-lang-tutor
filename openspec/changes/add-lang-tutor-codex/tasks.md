## 1. Hook Registration & Config Setup
Traceability: [REQ-001]

[x] 1.1 Create `.codex/hooks.json` registering the `UserPromptSubmit` event
  Blast Radius: `[".codex/hooks.json"]`
  DoD:
    [x] File is valid JSON
    [x] Declares `hooks.UserPromptSubmit` with command pointing to `.codex/lang-tutor/hook.py`
    [x] Command uses `$(git rev-parse --show-toplevel)` to resolve absolute path

[x] 1.2 Create `.codex/lang-tutor/config.json` with runtime options
  Blast Radius: `[".codex/lang-tutor/config.json"]`
  DoD:
    [x] File is valid JSON with all 8 OpenCode-compatible fields: enabled, nativeLanguages, forcedLanguage, cooldownMs, tipModel, displayMethod, toastDurationMs, mode
    [x] Default config has enabled=true, nativeLanguages=[], forcedLanguage=null, cooldownMs=10000, tipModel=null, displayMethod="toast", toastDurationMs=5000, mode="sync"
    [x] `displayMethod: "prompt"` is accepted but silently treated as toast (no SDK in subprocess)
    [x] `mode: "async"` is accepted but silently treated as sync (Codex skips async hooks)

[x] 1.3 Config is re-read on every hook invocation (live reload)
  Blast Radius: `[".codex/lang-tutor/hook.py"]`
  DoD:
    [x] `load_plugin_config()` reads config.json from disk on each call
    [x] Changing `enabled` to false takes effect on next invocation without Codex restart
    [x] Changing `cooldownMs` to 0 disables cooldown on next invocation

[x] 1.4 Wire `tipModel` config to override model name in LLM call
  Blast Radius: `[".codex/lang-tutor/hook.py"]`
  DoD:
    [x] If `tipModel` is set in config.json, use it as the model name instead of the session model
    [x] If `tipModel` is unset or empty, fall back to the session model from stdin
    [x] Provider config (base URL, API key) is always session-resolved — only model name changes
    [x] Graceful failure if model name doesn't exist on that provider (log WARN, no crash)

## 2. Hook Script — Core Pipeline
Traceability: [REQ-002]

[x] 2.1 Implement stdin JSON parsing and prompt extraction
  Blast Radius: `[".codex/lang-tutor/hook.py"]`
  DoD:
    [x] Parses `prompt`, `session_id`, `model` from stdin JSON
    [x] Returns `{"continue": true}` immediately if prompt is empty or whitespace
    [x] Handles malformed JSON gracefully — returns `{"continue": true}` without crashing

[x] 2.2 Implement code block stripping
  Blast Radius: `[".codex/lang-tutor/hook.py"]`
  DoD:
    [x] Fenced code blocks ```...``` replaced with `[CODE BLOCK]`
    [x] Inline code `code` replaced with `[CODE]`
    [x] Text without code passes through unchanged
    [x] Handles multiple code blocks and mixed fenced/inline code
    [x] Handles empty input

[x] 2.3 Implement LLM config resolver scanning Codex TOML files
  Blast Radius: `[".codex/lang-tutor/hook.py"]`
  DoD:
    [x] Scans project `.codex/config.toml`, user `~/.codex/config.toml`, and `~/.codex/*.config.toml` profile configs
    [x] Merges `model_providers` sections with later entries overwriting earlier
    [x] Resolves base URL, API key (from env var), and model name
    [x] Returns None gracefully if no config found — no crash, no LLM call
    [x] API key env var resolved via `os.environ.get(env_key)` with `{env:KEY}` syntax

[x] 2.4 Implement LLM tip fetch via /chat/completions
  Blast Radius: `[".codex/lang-tutor/hook.py"]`
  DoD:
    [x] Makes HTTP POST to `base_url + "/chat/completions"` with Authorization header
    [x] Sends system message (writing coach) + user message (stripped text)
    [x] Uses max_tokens=200, temperature=0.3
    [x] Handles HTTP errors, timeouts, and malformed responses — returns None
    [x] 15-second timeout respected

## 3. System Prompt & Language Support
Traceability: [REQ-002], [REQ-004]

[x] 3.1 Implement base writing-coach system prompt
  Blast Radius: `[".codex/lang-tutor/hook.py"]`
  DoD:
    [x] Prompt instructs model to respond ONLY with `[OK]` or a short tip
    [x] Tip must be under 25 words with no preamble or quotation marks
    [x] Model should analyze grammar, clarity, vocabulary, phrasing, naturalness

[x] 3.2 Implement forced language prompt variant
  Blast Radius: `[".codex/lang-tutor/hook.py"]`
  DoD:
    [x] When `forcedLanguage` is set, prompt instructs coaching in that specific language
    [x] ISO 639-1 (`"es"`), ISO 639-3 (`"spa"`), and language names (`"Spanish"`) all resolve to the same name
    [x] `resolve_forced_language_name()` normalizes input to readable language name

[x] 3.3 Implement native language suppression via prompt
  Blast Radius: `[".codex/lang-tutor/hook.py"]`
  DoD:
    [x] When `nativeLanguages` is non-empty, prompt tells the model to respond `[OK]` for those languages
    [x] ISO 639-1 and 639-3 codes normalized and language names resolved
    [x] `normalize_to_6393()` converts 2-letter codes to 3-letter
    [x] `normalize_native_languages()` deduplicates codes

[x] 3.4 Implement ISO 639 normalization lookup tables
  Blast Radius: `[".codex/lang-tutor/hook.py"]`
  DoD:
    [x] ISO_639_1_TO_3 mapping covers common languages (at least 180 entries)
    [x] ISO_639_3_TO_NAME mapping covers same languages
    [x] NAME_TO_639_3 reverse mapping built from ISO_639_3_TO_NAME
    [x] `lang_name_from_value()` returns readable name from any input format

## 4. Toast Display & Cooldown
Traceability: [REQ-003]

[x] 4.1 Implement ANSI terminal toast display
  Blast Radius: `[".codex/lang-tutor/hook.py"]`
  DoD:
    [x] Writes ANSI yellow text (code 33) to stderr with `✨ [Lang-Tip]:` prefix
    [x] Uses `\x1b[S` / `\x1b[1G` / `\x1b[u` cursor save/restore sequences
    [x] Auto-clears the line after `toastDurationMs` (default 5000ms)
    [x] Truncates tips longer than 80 characters with `...`
    [x] Outputs `{"continue": true, "systemMessage": ...}` to stdout alongside toast

[x] 4.2 Implement cooldown mechanism
  Blast Radius: `[".codex/lang-tutor/hook.py"]`
  DoD:
    [x] Reads last tip timestamp from `/tmp/lang-tutor-cooldown-{session_id}` file (per-session, session_id from hook JSON input)
    [x] Suppresses processing if cooldown period has not elapsed
    [x] Writes current timestamp to `/tmp/lang-tutor-cooldown-{session_id}` after showing tip
    [x] When `cooldownMs` is 0 or negative, cooldown checks are skipped
    [x] Handles missing/corrupt cooldown file gracefully

[x] 4.3 Implement file-based logging
  Blast Radius: `[".codex/lang-tutor/hook.py"]`
  DoD:
    [x] Logs to `/tmp/lang-tutor-{session_id}.log` with timestamp, level, and message
    [x] Supports DEBUG, INFO, WARN, ERROR levels
    [x] Logs hook invocation (session, model, prompt length)
    [x] Logs tip produced or `[OK]` received
    [x] Logs errors without crashing

## 5. Documentation
Traceability: [REQ-001]

[x] 5.1 Update AGENTS.md with Codex implementation details
  Blast Radius: `["AGENTS.md"]`
  DoD:
    [x] Change Codex status from "Planned" to "Implemented"
    [x] Add Codex section with architecture diagram (hook pipeline)
    [x] Document hook files table, config, and key differences from OpenCode

[x] 5.2 Update README.md with Codex config docs
  Blast Radius: `["README.md"]`
  DoD:
    [x] Add Codex to supported agents table as "Implemented"
    [x] Add "Configuration (Codex)" section with config.json options table
    [x] Add hook workflow explanation (diagram)
    [x] Add first-time setup instructions (/hooks trust)

## 6. Verification
Traceability: [REQ-001], [REQ-002], [REQ-003], [REQ-004]

[x] 6.1 Validate all files exist with correct structure
  Blast Radius: `[".codex/hooks.json", ".codex/lang-tutor/*"]`
  DoD:
    [x] `hooks.json` — valid JSON with `hooks.UserPromptSubmit`
    [x] `config.json` — valid JSON with all config fields
    [x] `hook.py` — Python syntax check passes (`py_compile`)

[x] 6.2 Run integration tests with real LLM
  Blast Radius: `[".codex/lang-tutor/hook.py"]`
  DoD:
    [x] Spanish prompt → produces language tip toast
    [x] Well-written English → no tip (`[OK]`)
    [x] Code-heavy prompt → code blocks stripped, reasonable behavior
    [x] Empty prompt → immediate `{"continue": true}`, no processing
    [x] Cooldown active → no LLM call, immediate `{"continue": true}`
    [x] Log file at `/tmp/lang-tutor-{session_id}.log` captures all invocations
    [x] Concurrent sessions: two different session_ids produce their own cooldown files without interference
    [x] Cooldown file naming: `/tmp/lang-tutor-cooldown-session-A` for session "session-A"
    [x] Log file naming: `/tmp/lang-tutor-session-A.log` for session "session-A" 
