## Why

The lang-tutor plugin currently uses `tool.execute.before` as its hook, which was a workaround because `chat.message` didn fire reliably in opencode v1.15.10. Now on v1.15.13, `chat.message` is a documented, typed hook in the SDK that provides the user message content directly. Switching eliminates a heavy workaround (fetching all session messages via SDK, walking backwards to find the latest, deduplicating with an unbounded Set) and aligns the implementation with the original spec.

Additionally, `nativeLanguages` and `forcedLanguage` config fields only accept ISO 639-3 codes (e.g., `"eng"`, `"spa"`), but users naturally write ISO 639-1 codes (e.g., `"en"`, `"es"`). The README and config examples already use ISO 639-1 (`"es"`) which won match franc-min ISO 639-3 output (`"spa"`). This mismatch causes tips to fire when they should be skipped.

## Parent Context

Standalone change. Extends the `add-lang-tutor-plugin` change (31/32 tasks complete).

## What Changes

1. **Hook switch**: Replace `tool.execute.before` with `chat.message` hook. The new hook provides `sessionID`, `model` (providerID + modelID), `messageID`, and the user message content via `output.parts` — no SDK message fetch needed.
2. **Migration path**: Add `chat.message` alongside the current `tool.execute.before` implementation. Disable the old hook immediately (log but skip). Remove the old hook code after the user verifies the new one works in production.
3. **ISO code compatibility**: Normalize `nativeLanguages` and `forcedLanguage` to ISO 639-3 at runtime using a full 639-1→639-3 lookup table (~184 entries). Also support human-readable language names (e.g., `"Spanish"` → `"spa"`) for `forcedLanguage`, since the system prompt uses language names.
4. **Memory leak fix**: Remove the unbounded `processedMessages` Set. Use `messageID` from the `chat.message` hook input as a lightweight dedup key if needed, though the hook should fire once per message.

## Scope Boundaries

### In Scope

- Switching the plugin hook from `tool.execute.before` to `chat.message`
- Adding ISO 639-1/639-3 dual compatibility for `nativeLanguages` and `forcedLanguage`
- Removing the `processedMessages` unbounded Set (memory leak)
- Removing the SDK message-fetch workaround (`ctx.client.session.messages`)
- Migration path: old hook disabled first, removed after verification
- Updating `IMPL-OPENCODE.md` and `AGENTS.md` to reflect the new hook
- Updating config documentation to clarify that both ISO 639-1 and 639-3 codes are accepted

### Out of Scope

- Adding new agent implementations (Codex, Claude Code, pi)
- Changing the tip display method (`session.prompt` vs toast)
- Changing the LLM request logic (system prompt, retry behavior)
- Adding persistent tip storage or session-end review
- Refactoring the entire plugin file structure

## Capabilities

### New Capabilities

- `iso639-normalize`: ISO 639-1/639-3/language-name normalization at runtime [REQ-001]

### Modified Capabilities

- `lang-tutor-plugin`: Hook changes from `tool.execute.before` to `chat.message`, message content now comes from hook output instead of SDK fetch, dedup uses `messageID` instead of unbounded Set [REQ-002]

## Contract Adherence

Standalone change. No slice contract stubs.

## Impact

- **Code**: `.opencode/plugin/lang-tutor/index.ts` — major refactor of the main hook handler and config resolution
- **Config**: `opencode.json` — no format change, but `nativeLanguages` and `forcedLanguage` now accept ISO 639-1 codes in addition to ISO 639-3
- **Docs**: `IMPL-OPENCODE.md`, `AGENTS.md`, `README.md` — update hook references and config documentation
- **Dependencies**: No new npm dependencies (ISO mapping is a static table in the plugin)
- **Backward compatibility**: ISO 639-3 codes still work exactly as before; ISO 639-1 is the new accepted format