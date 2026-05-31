## 1. ISO 639 normalization
Traceability: [REQ-001]

- [x] 1.1 Add `ISO_639_1_TO_3` static lookup table mapping all 184 ISO 639-1 codes to ISO 639-3 codes
  Blast Radius: `[".opencode/plugin/lang-tutor/index.ts"]`
  DoD:
    - [x] Table contains all 184 entries (verify count)
    - [x] `"en"` → `"eng"`, `"es"` → `"spa"`, `"zh"` → `"zho"`, `"ja"` → `"jpn"` etc.

- [x] 1.2 Add `ISO_639_3_TO_NAME` static lookup table mapping ISO 639-3 codes (that have 639-1 equivalents) to English language names
  Blast Radius: `[".opencode/plugin/lang-tutor/index.ts"]`
  DoD:
    - [x] Table contains entries for all 184 languages with 639-1 equivalents
    - [x] `"spa"` → `"Spanish"`, `"jpn"` → `"Japanese"`, `"eng"` → `"English"` etc.

- [x] 1.3 Implement `normalizeTo6393(value: string): string` — looks up value in ISO_639_1_TO_3 (if 2-char code), returns value if already 3-char, passes through if unrecognized
  Blast Radius: `[".opencode/plugin/lang-tutor/index.ts"]`
  DoD:
    - [x] `normalizeTo6393("en")` === `"eng"`
    - [x] `normalizeTo6393("eng")` === `"eng"`
    - [x] `normalizeTo6393("xx")` === `"xx"` (unknown 2-char passes through)
    - [x] `normalizeTo6393("xyz")` === `"xyz"` (unknown 3-char passes through)

- [x] 1.4 Implement `normalizeNativeLanguages(nativeLanguages: string[]): string[]` — normalizes each entry via `normalizeTo6393`, deduplicates
  Blast Radius: `[".opencode/plugin/lang-tutor/index.ts"]`
  DoD:
    - [x] `normalizeNativeLanguages(["en", "eng", "zh"])` === `["eng", "zho"]`
    - [x] `normalizeNativeLanguages(["spa"])` === `["spa"]`
    - [x] `normalizeNativeLanguages([])` === `[]`

- [x] 1.5 Implement `resolveForcedLanguageName(forcedLanguage: string): string` — normalizes to 639-3, then looks up name in ISO_639_3_TO_NAME; if not found, tries direct name match (reverse lookup); if still not found, returns value verbatim
  Blast Radius: `[".opencode/plugin/lang-tutor/index.ts"]`
  DoD:
    - [x] `resolveForcedLanguageName("es")` === `"Spanish"`
    - [x] `resolveForcedLanguageName("spa")` === `"Spanish"`
    - [x] `resolveForcedLanguageName("Spanish")` === `"Spanish"`
    - [x] `resolveForcedLanguageName("Esperanto")` === `"Esperanto"` (unknown name passes through)

- [x] 1.6 Wire normalization into `buildSystemPrompt` — use `resolveForcedLanguageName` instead of raw `forcedLanguage`
  Blast Radius: `[".opencode/plugin/lang-tutor/index.ts"]`
  DoD:
    - [x] Config `{ forcedLanguage: "es" }` produces system prompt mentioning "Spanish"

- [x] 1.7 Wire normalization into `isNativeLanguage` — compare normalized nativeLanguages against franc-min output
  Blast Radius: `[".opencode/plugin/lang-tutor/index.ts"]`
  DoD:
    - [x] Config `{ nativeLanguages: ["en"] }` correctly skips tips when franc-min returns `"eng"`

## 2. Hook switch: add chat.message handler
Traceability: [REQ-002]

- [x] 2.1 Implement `chat.message` hook handler that extracts user text from `output.parts`, applies the full tip pipeline (config → strip → detect → native check → fetch → display)
  Blast Radius: `[".opencode/plugin/lang-tutor/index.ts"]`
  DoD:
    - [x] Handler registered in plugin return object as `"chat.message"`
    - [x] Text extracted from `output.parts` by filtering TextPart entries and concatenating
    - [x] `messageID` used for dedup (bounded cache)

- [x] 2.2 Implement bounded `messageID` dedup cache — `Map<string, string[]>` (sessionID → array of last 100 messageIDs), skip tip if messageID already in cache for that session
  Blast Radius: `[".opencode/plugin/lang-tutor/index.ts"]`
  DoD:
    - [x] Same messageID never triggers tip twice in the same session
    - [x] Cache size bounded at 100 entries per session (shift when full)

- [x] 2.3 Use `input.model.modelID` from chat.message hook as fallback model ID (when no `tipModel` config)
  Blast Radius: `[".opencode/plugin/lang-tutor/index.ts"]`
  DoD:
    - [x] If `tipModel` is not set, model ID comes from `input.model.modelID`
    - [x] If `tipModel` is set, it overrides `input.model.modelID`

- [x] 2.4 Remove the SDK message-fetch workaround (`ctx.client.session.messages()` call and backward-walk logic)
  Blast Radius: `[".opencode/plugin/lang-tutor/index.ts"]`
  DoD:
    - [x] No `ctx.client.session.messages` call in the `chat.message` handler
    - [x] Text comes entirely from `output.parts`

- [x] 2.5 Remove the unbounded `processedMessages` Set
  Blast Radius: `[".opencode/plugin/lang-tutor/index.ts"]`
  DoD:
    - [x] `processedMessages` variable no longer exists
    - [x] No unbounded Set/Map for message dedup

## 3. Hook switch: disable tool.execute.before
Traceability: [REQ-002]

- [x] 3.1 Replace `tool.execute.before` handler body with a warning log and immediate return
  Blast Radius: `[".opencode/plugin/lang-tutor/index.ts"]`
  DoD:
    - [x] `tool.execute.before` handler logs `"tool.execute.before hook is disabled, use chat.message"` at WARN level
    - [x] Handler returns immediately without any processing

## 4. Sync/async mode behavior
Traceability: [REQ-002]

- [x] 4.1 In `mode: "sync"`, the `chat.message` handler awaits `runTip()` before returning
  Blast Radius: `[".opencode/plugin/lang-tutor/index.ts"]`
  DoD:
    - [x] When `mode` is `"sync"`, `await runTip()` is called before handler returns
    - [x] When `mode` is `"async"`, `Promise.resolve().then(runTip)` is called (fire-and-forget)

## 5. AbortController per-session for rapid-fire
Traceability: [REQ-002]

- [x] 5.1 Implement `TipsQueue` class with per-session AbortController tracking, `enqueue(sessionID, fn)` that aborts previous request and starts new
  Blast Radius: `[".opencode/plugin/lang-tutor/index.ts"]`
  DoD:
    - [x] Previous in-flight tip for same session is aborted when new message arrives
    - [x] Different sessions track independent AbortControllers

- [x] 5.2 Wire TipsQueue into `chat.message` handler
  Blast Radius: `[".opencode/plugin/lang-tutor/index.ts"]`
  DoD:
    - [x] Tip request is enqueued via TipsQueue, not called directly
    - [x] AbortController signal passed to `fetchTip`

## 6. Documentation updates
Traceability: [REQ-002]

- [x] 6.1 Update `IMPL-OPENCODE.md` — change hook section from `tool.execute.before` to `chat.message`, add messageID dedup note, add ISO normalization note
  Blast Radius: `["IMPL-OPENCODE.md"]`
  DoD:
    - [x] Hook section describes `chat.message` with `input` and `output` parameter types
    - [x] No mention of `tool.execute.before` as active hook (only as disabled/migration)

- [x] 6.2 Update `AGENTS.md` — change hook line from `tool.execute.before` to `chat.message`
  Blast Radius: `["AGENTS.md"]`
  DoD:
    - [x] Tooling section says OpenCode uses `chat.message` hook

- [x] 6.3 Update `README.md` — clarify that `nativeLanguages` and `forcedLanguage` accept both ISO 639-1 and ISO 639-3 codes, and language names for `forcedLanguage`
  Blast Radius: `["README.md"]`
  DoD:
    - [x] Config table shows examples with ISO 639-1 codes (`"en"`, `"es"`) and notes ISO 639-3 also accepted