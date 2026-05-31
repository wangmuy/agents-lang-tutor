## Context

The lang-tutor plugin currently uses `tool.execute.before` as its event hook — a workaround adopted because `chat.message` didn fire reliably in opencode v1.15.10. The workaround forces the plugin to: (1) fetch all session messages via SDK, (2) walk backwards to find the latest user message, (3) deduplicate with an unbounded `processedMessages` Set. This is heavy, leaky, and fires on every tool execution rather than every user message.

As of opencode v1.15.13, `chat.message` is a documented, typed hook in the SDK that provides session ID, model info, message ID, and the user message content directly via `output.parts`. Switching to this hook eliminates the workaround entirely.

Additionally, `nativeLanguages` and `forcedLanguage` config fields only accept ISO 639-3 codes (franc-min output format), but users naturally write ISO 639-1 codes or language names. The README and config examples already use ISO 639-1 codes that won match — causing tips to fire when they should be skipped.

## Goals / Non-Goals

**Goals:**
- Switch the plugin hook from `tool.execute.before` to `chat.message`
- Provide a safe migration path: add `chat.message` alongside, disable `tool.execute.before`, remove old code after user verification
- Normalize `nativeLanguages` entries to ISO 639-3 so both `"en"` and `"eng"` work
- Normalize `forcedLanguage` to ISO 639-3 and expand to language name for the system prompt, so `"es"`, `"spa"`, and `"Spanish"` all produce `"Spanish"` in the prompt
- Remove the unbounded `processedMessages` Set (memory leak)
- Use `messageID` from the hook as a lightweight dedup key

**Non-Goals:**
- Adding new agent implementations (Codex, Claude Code, pi)
- Changing the tip display method or LLM request logic
- Adding persistent tip storage
- Refactoring the plugin file structure

## Architecture Decision Records

### ADR-001: Switch from tool.execute.before to chat.message hook

- **Context**: `tool.execute.before` fires on every tool call, not every user message. The plugin compensates by fetching session messages, finding the latest user message, and deduplicating. This is heavy and leak-prone. The `chat.message` hook now works reliably in opencode v1.15.13 and provides user message content directly.
- **Decision**: Switch to `chat.message` hook. Add it alongside the current hook, disable the old one immediately, remove old code after verification.
- **Alternatives Considered**:
  1. Keep `tool.execute.before` and fix the leak — rejected: still fires on every tool call, still requires SDK message fetch, still needs dedup workaround
  2. Use `event` hook — rejected: the spec says `event` and `message.updated` don fire reliably (confirmed in v1.15.10 testing)
  3. Dual-registration (both hooks active simultaneously) — rejected: would double-process messages; instead we add new hook and disable old one
- **Consequences**: Hook fires once per user message (correct granularity). Message content comes from hook output (no SDK fetch). `processedMessages` Set becomes unnecessary. But: requires verification that `chat.message` actually fires in production before removing old code.

### ADR-002: Normalize language config to ISO 639-3 via static lookup table

- **Context**: franc-min returns ISO 639-3 codes (`"eng"`, `"spa"`). Users naturally write ISO 639-1 (`"en"`, `"es"`) or language names (`"Spanish"`). The current config only works with 639-3, but the README examples use 639-1 — a mismatch that causes tips to fire when they should be skipped.
- **Decision**: Build a static ISO 639-1→639-3 lookup table (~184 entries) inline in the plugin. Normalize `nativeLanguages` entries to 639-3 at runtime. For `forcedLanguage`, also maintain a 639-3→name mapping so the system prompt uses human-readable language names.
- **Alternatives Considered**:
  1. Use npm `iso-639-3` package (by wooorm) — rejected: adds a dependency with 7k+ entries when we only need ~184. Constitution says no build step, but this would work without one. Still: unnecessary bulk.
  2. Use npm `iso-639-1` package — rejected: similar concern, and doesn give us the 639-3→name mapping we need for `forcedLanguage`
  3. Normalize to 639-1 instead of 639-3 — rejected: some languages have no 639-1 code, and franc output is 639-3, so comparison would still need conversion
  4. Dual-match without normalization — rejected: config values could be ambiguous, and `forcedLanguage` still needs language name for the prompt
- **Consequences**: Both `"en"` and `"eng"` work for `nativeLanguages`. Both `"es"`, `"spa"`, and `"Spanish"` work for `forcedLanguage`. ~5KB of static data added to the plugin file. No new dependencies.

### ADR-003: Remove processedMessages Set, use messageID for dedup

- **Context**: The current `processedMessages` Set grows unboundedly — every processed message ID is added but never removed. Over a long session, this becomes a memory leak. The `chat.message` hook fires once per user message, so dedup should be unnecessary in theory.
- **Decision**: Remove the `processedMessages` Set entirely. Use `messageID` from the `chat.message` hook input as a lightweight safety dedup check (skip if we see the same messageID twice). Use a bounded cache (most recent N messageIDs per session) instead of an unbounded Set.
- **Alternatives Considered**:
  1. Keep the Set and add periodic cleanup — rejected: adds complexity, still grows before cleanup
  2. No dedup at all — rejected: if the hook ever fires twice for the same message (edge case), we want protection
  3. Use a Map with TTL — rejected: over-engineered for a simple safety check
- **Consequences**: No memory leak. Simple dedup with bounded memory. The hook should fire once per message, so the cache rarely triggers.

### ADR-004: Sync mode awaits tip, async mode fire-and-forgets

- **Context**: Some LLM providers only allow one request at a time (concurrency=1). In async mode, the tip request and the main AI response could race for the same provider, causing the tip to fail. In sync mode, the tip request completes before the main AI starts processing, which avoids the concurrency issue.
- **Decision**: In `mode: "sync"`, the `chat.message` hook awaits the tip request before returning. This means the main AI response is delayed until the tip request completes. In `mode: "async"`, the hook fires the tip request in the background and returns immediately (current fire-and-forget behavior).
- **Alternatives Considered**:
  1. Always async — rejected: breaks providers with concurrency=1
  2. Always sync — rejected: unnecessarily delays AI response for providers that handle concurrency
- **Consequences**: Users with concurrency=1 providers should use `mode: "sync"`. Users with high-concurrency providers can use `mode: "async"` for faster response. The default remains `"sync"` for safety.

## Negative Constraints

- Do NOT modify the LLM request logic (system prompt, retry behavior, `disableReasoning` fallback)
- Do NOT change the tip display format (`[LANG-TIP]` prefix, `session.prompt`/`toast`)
- Do NOT introduce new npm dependencies — the ISO mapping is a static table
- Do NOT remove the `tool.execute.before` hook until the user confirms `chat.message` works in production
- Do NOT change the config file format — existing configs must continue to work unchanged
- Do NOT modify files outside `.opencode/plugin/lang-tutor/` and documentation (`IMPL-OPENCODE.md`, `AGENTS.md`, `README.md`)

## Alignment Check

Constitution alignment:

- **Plugin = orthogonal capability** — compliant: all changes are within `.opencode/plugin/lang-tutor/`
- **No build step** — compliant: ISO table is inline TypeScript, no compilation needed
- **LLM config is runtime-discovered** — compliant: still reading `opencode.json` at runtime. Now we also get model info from the hook `input.model`, but we still resolve provider config from the config file
- **Zero agent-context pollution** — compliant: `noReply: true` still used, `[LANG-TIP]` prefix still used
- **Config-live-reload** — compliant: still re-reading config on every hook invocation
- **Never hardcode API keys/model IDs** — compliant: no hardcoding
- **Never introduce a build step** — compliant: static data, no bundler
- **Required: franc-min for language detection (ISO 639-3)** — compliant: franc-min still used, normalization layer sits on top
- **Required: stripCodeBlocks before detection** — compliant: still strips first
- **Required: two-layer language gate** — compliant: Layer 1 (normalized nativeLanguages) + Layer 2 (LLM [OK]) still in place

Edge case: The constitution says "Language detection uses `franc-min` (MIT license, ~150KB, no native deps). No alternative detection library MAY be added without architecture review." Our ISO normalization table is not a detection library — it's a static lookup. No conflict.

## Decisions

- The `chat.message` hook signature provides `model?: { providerID, modelID }` in input. This can be used directly for `tipModel` fallback (if no `tipModel` config, use `input.model.modelID`). The provider config resolution still needs to read `opencode.json` to find baseURL/apiKey.
- Message text extraction from `chat.message` hook: iterate `output.parts`, filter for `TextPart` (where `type === "text"`), concatenate `text` fields. This replaces the SDK message-fetch workaround.
- The `messageID` dedup cache will store the last 100 messageIDs per session (simple array, shift when full). This is bounded and trivially small.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| `chat.message` hook doesn fire reliably in v1.15.13 | Migration plan: add new hook alongside old, disable old, verify before removing |
| Sync mode delays main AI response | User chooses mode; default is sync for provider-concurrency safety; async available for low-latency |
| ISO table covers only 639-1→639-3 for ~184 languages with both codes | Languages with no 639-1 code must use 639-3 directly (same as before) — no regression |
| `forcedLanguage` name mapping covers only common languages | Full 639-3→name table included for all 184 entries; uncommon languages can use 639-3 code as fallback name |

## Migration Plan

1. **Phase 1 (this change)**: Add `chat.message` hook handler. Add `tool.execute.before` handler that logs a warning and returns immediately (disabled). Remove `processedMessages` Set. Add ISO normalization. Update docs.
2. **Phase 2 (after user verification)**: Remove `tool.execute.before` handler entirely. Clean up any dead code from the old workaround. Update docs to remove references to the old hook.

## Open Questions

- Should the `messageID` dedup cache be session-scoped (Map of sessionID→Array) or global (single Array)? Session-scoped is cleaner but slightly more memory. Leaning session-scoped for correctness.