## Context

Codex CLI provides a hooks framework for extensibility — shell scripts that run on lifecycle events like `UserPromptSubmit`. This is fundamentally different from the OpenCode plugin system (JS/TS SDK with `chat.message` hook). The Codex hook has no JS/TS runtime access, no SDK, no `client` context — it receives a JSON object on stdin and can write JSON to stdout and ANSI escape sequences to stderr.

The existing OpenCode plugin uses TypeScript with `franc-min` for language detection, `fetch()` for LLM calls, and SDK calls for display. Porting to Codex requires adapting to the hook's subprocess model.

## Goals / Non-Goals

**Goals:**
- Provide automatic writing tips after user message submission in Codex CLI
- Tips must be displayed as transient UI (no conversation history pollution)
- Must work with the same LLM provider/model the Codex session uses
- Zero external dependencies — stdlib Python only
- Config live-reload (no Codex restart for config changes)

**Non-Goals:**
- Port franc-min client-side language detection (delegated to LLM instead)
- In-stream prompt display via SDK — Codex hooks are subprocesses with no SDK access. Only terminal toast display is available
- Async execution — Codex hooks are always synchronous; async hook support is not yet implemented in the runtime
- Conversation history modification — the hook is read-only and always returns `{"continue": true}`

## Architecture Decision Records

### ADR-001: Python for hook script language

- **Context**: Codex hooks run as subprocess commands. The script needs to parse JSON stdin, make HTTP requests, write JSON stdout, and do terminal I/O. The OpenCode plugin is TypeScript, but Codex hooks don't provide a JS/TS runtime — only command execution.
- **Decision**: Use Python 3 stdlib. Python is available on all major platforms, has built-in `json`, `urllib.request`, `pathlib`, `os`, `sys`, `time`, `re`, and `tomllib` (3.11+). No `pip install` needed.
- **Alternatives Considered**:
  - Shell script (`bash`): Cannot reliably do JSON parsing or HTTP requests without `curl` + `jq` — fragile and non-portable.
  - TypeScript via `bun`: Not guaranteed available; would create a Node/Bun dependency.
  - Go/Rust compiled binary: Requires build step, violates constitution's no-build constraint.
- **Consequences**: Python subprocess adds ~50ms overhead per invocation. Python 3.12+ (tomllib) required. Constitution's "Banned: Python" rule needs exception — this is a hook subprocess, not an agent plugin runtime.

### ADR-002: LLM-based language detection instead of franc-min

- **Context**: The OpenCode plugin uses `franc-min` (JS library) for client-side language detection before sending to the LLM. In Python stdlib, no language detection library is available without `pip install`.
- **Decision**: Delegate language detection to the LLM system prompt. The system prompt instructs the model to respond `[OK]` if the text is in a native language (from config) or is well-written. This achieves the same two-layer gate (native skip + LLM quality check) but with both layers in the LLM call instead of client-side + LLM.
- **Alternatives Considered**:
  - `pip install langdetect`: Adds a dependency, requires Python packaging setup.
  - `pip install franc`: Same issue — JS native, Python wrapper awkward.
  - Shell-based `langid.py`: Would need to bundle a model file.
- **Consequences**: Every prompt incurs an LLM round-trip, even for native-language text. The cooldown mechanism mitigates this (only 1 tip per N seconds). LLM token cost is very low (~200 max_tokens at temperature 0.3).

### ADR-003: File-based cooldown state instead of in-memory

- **Context**: Each hook invocation is an independent subprocess — there is no shared memory between invocations. Cooldown requires persistent state across calls. Multiple Codex sessions may run concurrently (e.g., user opens multiple terminal tabs), and a shared cooldown file would cause them to interfere with each other.
- **Decision**: Use per-session files at `/tmp/lang-tutor-cooldown-{session_id}` containing the epoch milliseconds of the last tip. The `session_id` is available from the hook input JSON. Each concurrent Codex session gets its own cooldown state.
- **Alternatives Considered**:
  - Single shared file: Causes cross-session interference — one session's tip could suppress another session's tip.
  - In-process memory: Impossible — each hook is a fresh process.
  - Environment variables: Not shared across processes.
  - Config file writeback: Would pollute the user's config with runtime state.
- **Consequences**: File I/O is fast (~1µs). `/tmp` is cleaned on reboot, which is acceptable (cooldown resets on reboot). Per-session isolation means concurrent sessions don't interfere. Race conditions within the same session are benign (worst case: two hooks from the same session both pass cooldown and show tips).

### ADR-004: Profile config scanning for LLM provider resolution

- **Context**: Codex users can have profile-specific configs at `~/.codex/*.config.toml` (e.g., `cliproxyapi.config.toml`). The project `.codex/config.toml` references the profile via `model` only, with the provider config in the profile.
- **Decision**: Scan all config sources in order — project `.codex/config.toml`, user `~/.codex/config.toml`, then all `~/.codex/*.config.toml` profile files. Merge model_providers sections, later overwriting earlier.
- **Alternatives Considered**:
  - Only read project config: Misses profile configs (tested and confirmed failure).
  - Require explicit provider config in project: Breaks existing workflows.
  - Parse Codex flags/environment: Codex doesn't expose profile choice via env vars.
- **Consequences**: ~5ms overhead per invocation for config scanning. Robust — handles single-provider, multi-provider, and profile-based setups.

### ADR-005: tipModel config — optional model override

- **Context**: The OpenCode plugin supports a `tipModel` option to use a different (cheaper/faster) model for tip generation than the conversation model. For Codex, the session model is passed via stdin (`input.model`), and the hook can override it.
- **Decision**: Support `tipModel` in config.json. If set, the hook uses the model name from `tipModel` instead of the session's active model, but still uses the same provider (base URL, API key) from the session config. The provider config is always session-resolved — only the model name changes.
- **Alternatives Considered**:
  - Ignore `tipModel` entirely: Misses a valuable feature parity option.
  - Support a separate provider for tips: Too complex — would require a whole second provider config block, unlikely to be useful.
- **Consequences**: Tip model shares the same API key and base URL. If the model name doesn't exist on that provider, the LLM call fails gracefully (no tip, no crash).

### ADR-006: displayMethod "prompt" falls back to toast

- **Context**: OpenCode supports two display methods: `"prompt"` (inline in agent output via SDK `ctx.client.session.prompt()`) and `"toast"` (notification via `ctx.client.tui.showToast()`). Codex hooks are subprocess commands with no SDK access — they cannot call `session.prompt()`.
- **Decision**: Accept `displayMethod` in config.json, but treat `"prompt"` as a silent fallback to `"toast"`. The only display mechanism available from a subprocess hook is ANSI terminal escape sequences on stderr.
- **Alternatives Considered**:
  - Drop `displayMethod` from config: Would break ergonomic config sharing between agents.
  - Error on `"prompt"`: Would be surprising and fragile.
- **Consequences**: Config is portable between OpenCode and Codex. Users who copy their config get consistent behavior despite the fallback.

### ADR-007: mode "async" is silently sync-only

- **Context**: The OpenCode plugin supports `mode: "sync"` and `mode: "async"`. Async mode fires the tip request in the background while the main AI response begins. Codex hooks explicitly do not support async: "`async` is parsed, but async command hooks aren't supported yet."
- **Decision**: Accept `mode` in config.json for config portability, but always run synchronously. The `async` value is silently mapped to sync. The Codex hook always fires and completes before the main LLM call begins.
- **Alternatives Considered**:
  - Reject config with `mode: "async"`: Would break portable configs.
  - Omit `mode` from config entirely: Less ergonomic for cross-agent users.
- **Consequences**: Prompts always wait for the tip request to complete before the main model processes them. On slow LLM providers, this adds latency. The 15-second timeout prevents infinite waits.

## Negative Constraints

- Do NOT modify any file outside `.codex/` except AGENTS.md and README.md
- Do NOT introduce `pip install` dependencies — stdlib Python only
- Do NOT modify the user's prompt or add messages to the conversation — the hook MUST always return `{"continue": true}`
- Do NOT block the prompt — tip failures must silently degrade (no error toasts)
- Do NOT hardcode model names, API keys, or base URLs in hook.py or config.json
- Do NOT write runtime state into `.codex/` directories — use `/tmp/` for transient state with `{session_id}` scoping for concurrent session safety
- Do NOT require a build step or code generation

## Alignment Check

This design is checked against `openspec/project/constitution.md`:

| Constitution Rule | Status | Notes |
|------------------|--------|-------|
| #1 — Plugin = orthogonal capability | ✅ | All files in `.codex/`; shared artifacts in README.md, AGENTS.md only |
| #2 — No build step | ✅ | Python loaded directly, no compilation |
| #3 — LLM config runtime-discovered | ✅ | Resolved from TOML configs + env vars at runtime |
| #4 — Zero agent-context pollution | ✅ | ANSI toast on stderr + `continue: true`; no message modification |
| #5 — Config live-reload | ✅ | config.json read on every invocation |
| Banned: Python runtime | ⚠️ EXCEPTION | Constitution bans Python for agent plugin code, but Codex hooks are a subprocess mechanism — the hook script is not an agent plugin runtime. The Codex hooks framework is command-based (not JS/TS). Python 3 is the only portable option for JSON parsing + HTTP + TOML in stdlib. See ADR-001. |
| Required: `/chat/completions` endpoint | ✅ | Uses `urllib.request` to POST `/chat/completions` |
| Required: `stripCodeBlocks()` | ✅ | Implemented via regex in Python |
| Required: Two-layer language gate | ✅ | System prompt handles both native-skip and `[OK]` suppression |
| Required: Display method | ✅ | ANSI toast (non-persistent terminal notification) |
| Required: Logging at `/tmp/lang-tutor-{session_id}.log` | ✅ | Per-session logging; OpenCode also supports per-session log files |
| Apache-2.0 license notice | ✅ | In README.md |
| Banned: file:// paths | ✅ | Not used — hooks.json uses git-absolute path |
| Required: franc-min | ⚠️ EXCEPTION | See ADR-002 — Python stdlib has no client-side language detection; delegated to LLM |

Two constitution exceptions granted:
1. Python runtime (ADR-001) — Hook subprocess, not agent plugin code
2. franc-min language detection (ADR-002) — Delegated to LLM via system prompt

## OpenCode ↔ Codex Config Compatibility Matrix

| Config Option | OpenCode | Codex | Status | Notes |
|--------------|----------|-------|--------|-------|
| `enabled` | ✅ | ✅ | **Implemented** | Config.json boolean; live-reloaded |
| `nativeLanguages` | ✅ | ✅ | **Implemented** | Array of ISO 639-1/639-3 codes |
| `forcedLanguage` | ✅ | ✅ | **Implemented** | Overrides coaching language |
| `cooldownMs` | ✅ | ✅ | **Implemented** | Per-session cooldown at `/tmp/lang-tutor-cooldown-{session_id}` |
| `tipModel` | ✅ | ⚠️ | **Can be added** | Overrides model name only; provider config still session-resolved |
| `displayMethod` | ✅ `"prompt"`/`"toast"` | ⚠️ | **Toast-only** | `"prompt"` silently falls back to `"toast"` — no SDK access from subprocess |
| `toastDurationMs` | ✅ | ✅ | **Implemented** | Controls ANSI toast display duration |
| `mode` | ✅ `"sync"`/`"async"` | ❌ | **Sync-only** | Codex runtime doesn't support async hooks; config accepted silently |

**Summary**: 6 of 8 options are fully implementable. 1 (`displayMethod` `"prompt"`) degrades gracefully to toast. 1 (`mode` `"async"`) is silently sync-only.

## Decisions

- **Log path**: `/tmp/lang-tutor-{session_id}.log` — per-session, same base path as OpenCode for consistency
- **Cooldown path**: `/tmp/lang-tutor-cooldown-{session_id}` — per-session, separate from log for atomicity
- **Toast duration**: 5 seconds default (configurable), with ANSI save/restore cursor sequences
- **LLM temperature**: 0.3 — low enough for deterministic tips, high enough for variety
- **LLM max_tokens**: 200 — tips are <25 words, no need for more
- **Timeout**: 15 seconds in hooks.json (10s for hook script logic + safety margin)
- **Hook output**: `{"continue": true}` always — never blocks. `systemMessage` field used as additional notification trigger

## Risks / Trade-offs

- **Python dependency**: Python 3.12+ required for `tomllib`. Most modern systems have this, but older LTS releases (Ubuntu 20.04 has Python 3.8) would need `tomli` fallback or a pip install.
- **LLM latency**: Each user prompt triggers an LLM call. On slow providers, the hook may delay the prompt response (Codex waits for hooks before processing). 15-second timeout mitigates worst-case.
- **ANSI toast fragility**: Terminal emulators may not support ANSI cursor save/restore sequences reliably. The toast degrades gracefully — it just may not display on exotic terminals.
- **No language detection before LLM call**: Every prompt incurs a token cost even for native-language text. The system prompt tries to keep responses to 1-2 tokens for `[OK]` cases.
- **Cooldown file collision**: Per-session cooldown files (`/tmp/lang-tutor-cooldown-{session_id}`) prevent cross-session interference. Each concurrent Codex session tracks its own cooldown independently.

## Migration Plan

1. Create `.codex/hooks.json` — register `UserPromptSubmit` hook
2. Create `.codex/lang-tutor/config.json` — default config
3. Create `.codex/lang-tutor/hook.py` — full hook script
4. Update `AGENTS.md` — mark Codex as Implemented
5. Update `README.md` — add Codex config section
6. Trust hook via `/hooks` in Codex CLI (manual step)

## Open Questions

- Should the hook also fire on subagent prompts? (Currently only main session prompts.)
- Should we add a `tomli` fallback for Python <3.11?
- Should the toast duration be shorter (3s) for less intrusiveness?
