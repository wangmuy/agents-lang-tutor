# Constitution

Hard constraints: MUST / NEVER / SHALL NOT.
Violations are BLOCKING. AI agents check this before every change.
Advisory guidance (SHOULD / PREFER) belongs in `standards.md`, not here.

## Core Principles

1. **Plugin = orthogonal capability** — Each agent plugin MUST be entirely
   self-contained within that agent's directory. No code in one agent's directory
   may be shared with another agent's directory. The only shared artifacts are
   `README.md`, `AGENTS.md`, and `openspec/`.

2. **No build step** — ALL TypeScript/JavaScript source files SHALL be loaded
   directly by the target runtime. NO bundler, transpiler, or compilation step
   MAY be introduced.

3. **LLM config is runtime-discovered** — The active model, provider, base URL,
   and API key MUST be resolved from the agent's own config file at runtime.
   NEVER hardcode model names, endpoints, or credentials in plugin code.

4. **Zero agent-context pollution** — Tips MUST be displayed without being added
   to the AI conversation context (using the agent's equivalent of
   `{ noReply: true }`). The plugin SHALL NOT leak internal state into the
   message stream.

5. **Config-live-reload** — Plugin config MUST be re-read from the agent's
   config file on every invocation, not cached at startup. The user MUST be able
   to toggle `enabled` or change settings without restarting the agent.

## Banned Patterns

- NEVER hardcode API keys, model IDs, base URLs, or provider names in source
  code. All credentials come from agent config or environment variables.
- NEVER introduce a build step, bundler, or npm `prepare` script that transforms
  source before execution.
- NEVER write to or modify the AI conversation message array. Display-only
  mechanisms (inline prompt, notification) are the sole output path.
- NEVER share mutable state across agent plugins (e.g., one agent's code
  importing from another agent's directory).
- NEVER use `console.log` for plugin output — use the file-based logger at
  `os.tmpdir()/lang-tutor.log` (auto-rotated at 5MB).
- NEVER use absolute `file://` paths for plugin entries in agent config —
  relative paths ONLY.

## Required Patterns

- All LLM API calls MUST use the OpenAI-compatible `/chat/completions` endpoint
  via native `fetch()`. No SDK wrappers.
- Every plugin MUST implement code-block stripping (`stripCodeBlocks()` or
  equivalent) BEFORE language detection, so franc-min focuses on natural text.
- Every plugin MUST implement a two-layer language gate: (1) client-side
  franc-min native-language skip, (2) LLM `[OK]` response suppression.
- Config MUST be read from the agent's native config file. Plugin-specific
  options live in the plugin entry within that config.
- Display MUST support at minimum one inline method (output that is not added
  to conversation context) and one non-blocking method (notification/toast).
- Logging MUST use the shared logger at `os.tmpdir()/lang-tutor.log` with
  levels DEBUG, INFO, WARN, ERROR and auto-rotation at 5MB.

## Compliance Requirements

- Apache-2.0 license notice MUST appear in every plugin entry-point file and
  in `README.md`.
- Language detection uses `franc-min` (MIT license, ~150KB, no native deps).
  No alternative detection library MAY be added without architecture review.

## Tech Stack Constraints

- **Required**: `franc-min` ^6.0.0 for client-side language detection (ISO 639-3)
- **Required**: TypeScript (loaded directly, no build step)
- **Allowed**: Any agent's native plugin SDK
- **Allowed**: LLM providers reachable via HTTP `fetch()`
- **Banned**: Node.js build tools (webpack, esbuild, tsc, bun build, etc.)
- **Banned**: Python, Go, Rust, or any non-JS/TS runtime dependency
- **Banned**: Database systems, message queues, or persistent servers