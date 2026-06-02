## Context

Claude Code is the third agent platform targeted by the lang-tutor plugin, following OpenCode (TypeScript SDK-based) and Codex (Python subprocess hook). The goal is to provide the same writing-coach feedback — grammar, vocabulary, clarity tips under 25 words — within Claude Code sessions.

Claude Code's hook system is mature: `UserPromptSubmit` fires on every user prompt, passing the prompt text via stdin JSON. Hooks can be command subprocesses, HTTP endpoints, MCP tools, prompts, or agents. Command hooks are the most flexible for this use case, matching Codex's architecture.

Key constraints:
- No shared core library — each agent has a self-contained implementation
- Pure Python 3 stdlib, no external dependencies
- File-based state (cooldown, logging) since each invocation is a fresh process
- Must never block or modify the user's prompt

## Goals / Non-Goals

**Goals:**
- Detect user message language and grammar issues via LLM delegation
- Display a short tip (under 25 words) when writing can be improved
- Support sync mode (blocking, auto-clearing) and async mode (non-blocking, persistent display)
- Support two display channels: stderr ANSI toast and systemMessage JSON
- Resolve LLM API credentials from Claude Code settings and environment variables
- Cooldown mechanism to avoid spamming tips on rapid messages
- Logging to `/tmp/lang-tutor-{session_id}.log`
- Integration instructions for hook registration

**Non-Goals:**
- No shared core library with OpenCode/Codex (each self-contained)
- No client-side language detection library (LLM-delegated)
- No GUI, interactive tip selection, or prompt rewriting
- No Claude Code plugin packaging (plain hook registration)
- No test runner setup

## Architecture Decision Records

### ADR-001: Hook Event — Use UserPromptSubmit

- **Context**: We need a Claude Code lifecycle point that fires once per user message, before Claude processes it, so we can observe the prompt and display a tip without blocking.
- **Decision**: Use `UserPromptSubmit` — fires on every user prompt via stdin JSON. Same event Codex uses. The hook runs before model processing but can pass the prompt through unchanged on exit 0.
- **Alternatives Considered**: 
  - `PreToolUse` — fires per tool call, not per prompt; would fire many times per turn
  - `Stop` — fires after Claude responds; too late for a per-prompt tip
  - Prompt hooks — designed for yes/no decisions, not free-form text output
- **Consequences**: The hook runs once per user turn, which is the correct cadence. The subprocess overhead per invocation (~50ms) is negligible compared to the LLM call.

### ADR-002: Hook Type — Command Hook

- **Context**: Claude Code offers 5 hook types. We need to make an outbound LLM API call and display free-form text.
- **Decision**: Use `type: "command"` (exec form with `python3 + args`). The script reads stdin, calls LLM, and outputs via stderr/stdout.
- **Alternatives Considered**:
  - `type: "prompt"` — sends a prompt to a fast Claude model but is designed for structured decisions, not free-form text display. No way to surface a tip string to the user.
  - `type: "agent"` — experimental, spawns a subagent with tools, overkill for a single LLM call
  - `type: "http"` — requires an external HTTP server
  - `type: "mcp_tool"` — requires an MCP server
- **Consequences**: Fresh Python subprocess per invocation. No process-wide state — must use filesystem for cooldown and logging. Cannot use `ctx.client` SDK methods available to OpenCode plugin.

### ADR-003: Script Language — Python 3 Stdlib

- **Context**: The script must make HTTP API calls, parse JSON, handle file I/O, and process strings.
- **Decision**: Python 3 stdlib. No external packages. Uses `urllib.request`, `json`, `os`, `sys`, `re`, `time`, `pathlib`, `threading`.
- **Alternatives Considered**:
  - Shell script + `curl`/`jq` — fragile for JSON handling and error paths
  - Node.js — requires external dependency (franc-min) and Node runtime
  - Python with `requests`/`anthropic` — adds dependency installation burden
- **Consequences**: Runs anywhere Python 3 is installed. `urllib.request` is more verbose than `requests` but avoids dependency management. Codex already uses this approach successfully.

### ADR-004: Language Detection — LLM-Delegated

- **Context**: The hook needs to know what language the user wrote in to provide appropriate coaching.
- **Decision**: Delegate language detection to the LLM system prompt. The prompt instructs the model to analyze the text "in whatever language it's written in." No client-side detection library.
- **Alternatives Considered**:
  - `franc-min` (Python port or subprocess call) — adds ~6KB n-gram detection but requires a Node runtime or Python port of the algorithm
  - Language detection via Python libraries (`langdetect`, `langid`) — adds external dependencies
- **Consequences**: One LLM call handles both detection and coaching. Slightly higher latency than client-side detection, but simpler architecture. Matches Codex's approach. The `nativeLanguages` and `forcedLanguage` config options modify the system prompt rather than pre-filtering.

### ADR-005: LLM API — Anthropic Messages API

- **Context**: Claude Code natively uses the Anthropic API. The hook needs to call an LLM for writing tips.
- **Decision**: Default to Anthropic Messages API (`https://api.anthropic.com/v1/messages`). Allow config override via `baseUrl` (optional) and `tipModel`. Use Anthropic-compatible wire format.
- **Alternatives Considered**:
  - OpenAI-compatible Chat Completions — users proxying Claude Code through other providers would need this, but it's a secondary concern
  - Use Claude Code's own session model (no API call) — not feasible; hooks have no access to the active LLM session
- **Consequences**: Requires `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` env var (or configured in settings files). Users routing Claude Code through third-party proxies can set `wireApi: "chat"` and `baseUrl` in config.

### ADR-006: Display — Two Methods with Mode-Dependent Behavior

- **Context**: Tips must be surfaced to the user without modifying the conversation or blocking the prompt. Claude Code hooks don't have an SDK `showToast()` equivalent.
- **Decision**: Two display methods governed by config:
  - `"stderr"` (default): Write ANSI escape sequences to stderr. In **sync** mode, sleep for `toastDurationMs` then clear the line. In **async** mode, print and exit immediately (tip persists in scrollback).
  - `"systemMessage"`: Write JSON `{"continue": true, "systemMessage": "[Lang-Tip] ..."}` to stdout. Mode is irrelevant — systemMessage is persistent.
- **Alternatives Considered**:
  - `additionalContext` on stdout JSON — injects tip into Claude's context window (token cost, pollutes context)
  - Plain stdout text — added as context for Claude, same token cost issue
  - Writing to a GUI notification — not available in CLI mode
- **Consequences**: stderr mode is terminal-native and matches Codex's display pattern. systemMessage mode is less visually polished but works in all cases. Async mode with stderr gives users a persistent scrollback tip that doesn't race with Claude's output.

### ADR-007: State — Filesystem via /tmp/

- **Context**: Each hook invocation is a fresh Python process. There is no in-process memory for cooldown tracking or session state.
- **Decision**: Store cooldown timestamps and log entries in `/tmp/lang-tutor-{session_id}.*` files. Same pattern as Codex.
- **Alternatives Considered**:
  - Process-shared state (e.g., daemon process) — adds complexity, defeats the fresh-process model
  - Files in project directory — pollutes the project, may not be writable
- **Consequences**: `/tmp/` is ephemeral and available on all Unix systems. Cooldown file contains a Unix timestamp in milliseconds. Log file is appended on each invocation.

### ADR-008: Threading — Use threading.Thread for Sync Mode Auto-Clear

- **Context**: In sync mode with stderr display, the script must sleep `toastDurationMs` then clear the stderr line before exiting — but the original prompt must be passed through to stdout immediately.
- **Decision**: In sync+stderr mode, fork a background thread that sleeps N seconds then clears the stderr line, while the main thread writes the prompt to stdout and exits. The thread is a daemon thread — it runs while the process stays alive for `toastDurationMs`.
  - Actually, simpler: `threading.Timer(toastDurationMs/1000, clear_fn).start()`, then write prompt to stdout, then keep the main thread alive via `time.sleep(toastDurationMs/1000)` or join the timer. Or: print ANSI clear sequence, flush stderr, write prompt to stdout, then `time.sleep()`. Since exit 0 is the return, we can sleep before exiting.
  - **Final decision**: Write tip + ANSI clear sequence to stderr, immediately pass prompt to stdout, then `time.sleep(toastDurationMs/1000)`, then write ANSI clear to stderr again, then `sys.exit(0)`. This blocks the process for the toast duration but gives a clean auto-clear. The async case avoids the sleep entirely.
- **Alternatives Considered**:
  - `os.fork()` — Unix-only, more complex, child process management
  - `subprocess.Popen` for a sleeper — creates more processes
  - Using Claude Code's `async: true` hook field — then stdout isn't processed, breaking systemMessage mode
- **Consequences**: Sync mode adds `toastDurationMs` (default 5000ms) of process lifetime after the prompt is forwarded. The prompt reaches Claude immediately since stdout is flushed before sleep. The process just stays alive to hold the stderr display.

## Negative Constraints

- Do NOT introduce third-party Python packages (stdlib only)
- Do NOT modify the user's prompt — always pass it through unchanged on stdout
- Do NOT block the user's prompt — exit 0 with the prompt on stdout
- Do NOT create files outside /tmp/ or .claude/lang-tutor/
- Do NOT add a shared core library — keep the Claude Code implementation self-contained
- Do NOT reference any OpenCode, Codex, or other agent files from this code

## Alignment Check

This project does not have a `constitution.md` yet. Key design values inferred from existing implementations:
- Self-contained per-agent (no shared core) — ✅ honored
- Pure stdlib Python (Codex pattern) — ✅ honored
- Config matches OpenCode/Codex schema — ✅ honored
- Never blocks the user's workflow — ✅ honored
- Quiet failure (if anything goes wrong, silently pass the prompt through) — ✅ honored

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D-001 | Config stored in `.claude/lang-tutor/config.json` | Matches Codex's dedicated config file pattern; avoids polluting settings.json with plugin options |
| D-002 | Hook registration in `.claude/settings.local.json` (gitignored) | Local.json is gitignored by default; users who want to commit can add to `.claude/settings.json` |
| D-003 | ISO 639 normalization tables from OpenCode implementation, ported to Python | Same data, same behavior; copied rather than shared to keep self-contained |
| D-004 | Log rotation at 5MB | Matches OpenCode behavior |
| D-005 | Default tipModel: `claude-sonnet-4-6` | Fast, cheap for small prompts; matches "fast model" default of prompt hooks |
| D-006 | Code block stripping regex ported exactly from OpenCode | Same behavior for fenced ``` blocks and inline `code` |

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM API call adds latency (300-800ms) | Delays tip display, but not the prompt itself | Prompt is forwarded immediately on stdout; only the display stage may block |
| ANTHROPIC_API_KEY not set | Hook silently skips — no tips shown | Log a debug message, exit 0 |
| Settings file not found or malformed | Hook silently skips | Log a debug message, exit 0 |
| User types in a native language with no issues | LLM returns [OK], no tip shown | Cooldown prevents repeated [OK] calls |
| Threading complexity in sync+stderr | Race conditions on stderr | Only print/clear from one thread at a time; simple sleep-based approach |
| /tmp/ files accumulate | Disk space | Log rotation at 5MB; cooldown files are small single-line files |

## Migration Plan

No migration — this is a new feature. Implementation steps:

1. Create `.claude/lang-tutor/config.json` with default settings
2. Create `.claude/lang-tutor/hook.py` with the full implementation
3. Add hook registration to `.claude/settings.local.json`
4. Update AGENTS.md to mark Claude Code as "Implemented" with notes

## Open Questions

- Should `ANTHROPIC_AUTH_TOKEN` take priority over `ANTHROPIC_API_KEY`? AUTH_TOKEN is Claude Code's primary auth mechanism. **Decision from explore mode**: scan settings first, then AUTH_TOKEN, then API_KEY.
- Should the config support a custom `baseUrl` field for non-Anthropic API endpoints? **Design choice**: add `baseUrl` and `wireApi` ("messages"|"chat") optional fields to config for flexibility.