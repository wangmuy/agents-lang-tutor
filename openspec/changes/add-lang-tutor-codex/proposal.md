## Why

The project already has a working lang-tutor plugin for OpenCode (via its JS/TS SDK plugin system), but the Codex coding agent is marked as "Planned" with no implementation. Users who switch between agents lose the language-tutoring experience. This change ports the same behavior to Codex's hooks framework, giving Codex users the same automatic writing tips without polluting conversation history.

## Parent Context

Standalone change.

## What Changes

Add a Codex lang-tutor hook plugin under `.codex/lang-tutor/` consisting of:

- `.codex/hooks.json` — registers the `UserPromptSubmit` hook event
- `.codex/lang-tutor/hook.py` — Python hook script that: reads stdin JSON, strips code blocks, calls the active LLM with a writing-coach system prompt, and displays tips as transient ANSI terminal toasts
- `.codex/lang-tutor/config.json` — live-reloaded runtime configuration with all 8 OpenCode-compatible options (enabled, nativeLanguages, forcedLanguage, cooldownMs, tipModel, displayMethod, toastDurationMs, mode)

## Scope Boundaries

### In Scope

- Codex hook registration and hook script implementation
- ANSI terminal toast display (temporary, auto-clears, no conversation pollution)
- LLM integration using the same provider/model as the active Codex session (resolved from project, user, and profile configs)
- Code block stripping before analysis
- Cooldown support to avoid spam
- Native language suppression (`nativeLanguages`)
- Forced language coaching (`forcedLanguage`)
- File-based logging to `/tmp/lang-tutor-{session_id}.log` (per-session, supports concurrent Codex processes)
- Documentation updates (AGENTS.md, README.md)

### Out of Scope

- No language detection library — language detection is delegated to the LLM (stdlib Python only, zero dependencies)
- No prompt or conversation modification — the hook is read-only, tips are purely transient UI notifications
- No inline-prompt display — Codex hooks have no SDK access; only `"toast"` display works. `displayMethod: "prompt"` falls back to toast
- No `mode: "async"` support — Codex hooks are always synchronous; the runtime skips async handlers. Config option exists but is silently sync-only
- No message dedup cache — the hook doesn't have messageID tracking; dedup is handled by cooldown timing

## Capabilities

### New Capabilities

- `codex-hook-registration`: `.codex/hooks.json` declares the `UserPromptSubmit` hook binding, discovered by Codex on session start
- `codex-hook-script`: Python hook script at `.codex/lang-tutor/hook.py` that implements the full pipeline (stdin parsing, code stripping, LLM call, toast display)
- `codex-config-live`: Runtime config at `.codex/lang-tutor/config.json` with enabled, nativeLanguages, forcedLanguage, cooldownMs, toastDurationMs — read live on every hook invocation
- `codex-llm-config-resolver`: Auto-discovers Codex provider configuration from project/user/profile TOML files and env vars, using the same LLM the session uses
- `codex-toast-display`: ANSI terminal escape sequence based toast — temporary yellow bar above the prompt, auto-clears after configured duration
- `codex-cooldown`: Per-session file-based cooldown tracking via `/tmp/lang-tutor-cooldown-{session_id}` — supports concurrent Codex processes without interference
- `codex-tip-model`: Optional `tipModel` config field overrides the model name for tip generation. If unset, falls back to the active session model
- `codex-iso639-support`: ISO 639-1 → 639-3 normalization and language name resolution for nativeLanguages and forcedLanguage options

## Contract Adherence

Standalone change — no shared contract stubs.

## Impact

- New files under `.codex/lang-tutor/` and `.codex/hooks.json`
- Updated documentation in `AGENTS.md` (mark Codex as Implemented, add Codex section) and `README.md` (add Codex config docs)
- No changes to any existing plugin code or agent implementations
- Zero new dependencies — stdlib Python only
