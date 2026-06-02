## Why

The lang-tutor plugin currently supports OpenCode (TypeScript, SDK-based) and Codex (Python, CLI hooks). Adding Claude Code support completes the third major coding-agent runtime. Users who switch between OpenCode, Codex, and Claude Code get consistent writing-coach feedback across all their tools.

Claude Code's hook system is mature (UserPromptSubmit, async hooks, stderr/stdout display), making it a natural fit for the same pattern Codex uses — a subprocess hook that calls an LLM to produce short grammar/vocabulary tips.

## Parent Context

Standalone change. Part of the broader lang-tutor plugin ecosystem spanning OpenCode, Codex, and Claude Code agents.

## What Changes

Add a new `.claude/lang-tutor/` directory containing:

- **`hook.py`**: Python 3 stdlib script registered on the `UserPromptSubmit` hook event
- **`config.json`**: User-facing configuration (enabled, nativeLanguages, forcedLanguage, cooldownMs, tipModel, displayMethod, toastDurationMs, mode)

Update `.claude/settings.json` (or `.claude/settings.local.json`) to register the hook.

The hook:
1. Reads user prompt from stdin JSON
2. Strips code blocks (fenced + inline)
3. Reads config and resolves LLM provider credentials (Claude Code settings → env vars)
4. Calls the LLM (Anthropic Messages API by default) with a writing-coach system prompt
5. If the LLM returns a tip (not `[OK]`), displays it via stderr ANSI toast or systemMessage
6. Passes the original prompt through (never blocks or modifies it)

## Scope Boundaries

### In Scope

- Claude Code hook script (Python 3 stdlib, no external dependencies)
- Config file with same options as OpenCode/Codex implementations
- LLM config resolution: project settings → user settings → env vars → defaults
- LLM-delegated language detection (no client-side library)
- Two display methods: stderr ANSI toast and systemMessage
- Two modes: sync (blocking, auto-clear) and async (non-blocking, persistent display)
- File-based cooldown tracking and logging in `/tmp/`
- Code block stripping (fenced + inline)
- Integration instructions for the user

### Out of Scope

- No shared core library with OpenCode/Codex implementations (each agent remains self-contained)
- No client-side language detection library (no franc-min)
- No GUI or interactive selection of tips
- No automatic prompt rewriting (feedback-only)
- No plugin system packaging (plain hook registration, not a Claude Code plugin)
- No test runner setup (bun not in PATH)

## Capabilities

### New Capabilities

- `writing-coach`: On each user prompt, the hook detects language and grammar issues via LLM, and displays a short improvement tip (under 25 words). [REQ-001]
- `config-management`: Loads user-facing config from `.claude/lang-tutor/config.json` with overridable fields matching the OpenCode/Codex implementations. [REQ-002]
- `llm-config-resolution`: Resolves LLM API credentials by scanning Claude Code settings files and environment variables in priority order. [REQ-003]
- `display-modes`: Two display channels (stderr ANSI toast, systemMessage JSON) and two pacing modes (sync with auto-clear, async with persistent display). [REQ-004]
- `state-management`: File-based cooldown (per-session timestamp files in /tmp/) and logging. [REQ-005]

### Modified Capabilities

None — this is a new agent integration.

## Contract Adherence

Standalone change — no slice-level contracts to adhere to.

## Impact

- **New files**: `.claude/lang-tutor/hook.py` (~550 lines), `.claude/lang-tutor/config.json`
- **Modified files**: `.claude/settings.json` or `.claude/settings.local.json` (hook registration)
- **Dependencies**: Python 3 stdlib only (json, os, sys, re, time, urllib.request, pathlib, threading)
- **Runtime**: Subprocess per user prompt (~300-800ms for LLM call)
- **Environment**: Requires `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` (or configured in settings.json)