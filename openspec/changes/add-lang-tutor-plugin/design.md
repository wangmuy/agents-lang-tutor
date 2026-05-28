## Context

OpenCode plugins can hook into the server-side message pipeline via `chat.message`, receiving the active model info (`{ providerID, modelID }`) and the user's message content. They have access to the OpenCode SDK client (`ctx.client`) for session operations. However, there is no internal API for plugins to invoke AI generation independently — the LLM pipeline (`session/llm.ts`) is tightly coupled to session state and inaccessible to plugin code.

The plugin must therefore:
1. Discover the provider configuration from `opencode.json` (baseURL, apiKey) to call the LLM directly via `fetch()`
2. Display results inline without polluting the AI conversation context

## Goals / Non-Goals

**Goals:**
- Intercept each user `chat.message`, strip code blocks to placeholders, fire an independent LLM call for a writing tip, and display it inline
- Tip is about the user's own language usage (grammar, clarity, phrasing, word choice), not about the semantic content of their question
- Tip is never added to the AI's conversation context (uses `noReply: true`)
- Plugin is configurable via `opencode.json` plugin options
- Does not block or delay the main AI response

**Non-Goals:**
- A TUI plugin with custom rendering — this is a server-only plugin
- Tips about the user's question meaning (e.g., "arigatou means thank you") — tips are always about the user's writing quality
- Persistent storage of tips beyond the session
- High-accuracy long-document language detection — the `nativeLanguages` gate is best-effort for short text

## Decisions

### 1. Server-only plugin (no TUI component)

**Rationale**: A single server plugin is simpler than a coordinated server+TUI pair. `session.prompt({ noReply: true })` provides inline visual display without AI context pollution. The tip message persists in the session's message list (same lifetime as the session), which is acceptable — the tradeoff is far less complexity than a SolidJS TUI slot plugin.

**Alternative considered**: TUI slot plugin rendering into `sidebar_content` or a custom slot. Rejected because it requires two coordinated plugins (server for hook + TUI for display), SolidJS knowledge, and event bus bridging. This can be revisited if the `session.prompt` approach proves too noisy.

### 2. Direct `fetch()` to provider API instead of internal generation

**Rationale**: OpenCode has no plugin-accessible AI generation API. `ctx.client` only exposes session operations. The provider's OpenAI-compatible `/chat/completions` endpoint is well-defined and trivially callable with `fetch()`.

**Alternative considered**: Using `session.prompt()` with a hidden system instruction to have the main agent generate the tip. Rejected because it would either wait for the main response to finish (too late) or inject into the conversation context (violates "no clutter" requirement).

### 3. Config discovery by reading `opencode.json` from filesystem

**Rationale**: `PluginInput` has `worktree` and `directory` properties, plus Node.js `os.homedir()` gives access to `~/.config/opencode/`. Reading the JSON directly mirrors OpenCode's own config resolution logic.

Config resolution order:
1. `{ctx.worktree}/opencode.json` (project-level)
2. `{os.homedir()}/.config/opencode/opencode.json` (user-level)
3. Project config takes precedence

From the config, extract:
- Model for tips: `tipModel` plugin option if configured, otherwise `input.model.modelID` from the `chat.message` hook
- Provider mapping: find which provider contains the model in its `models` map
- Provider options: `baseURL` and `apiKey` from the matched provider's `options`
- Env var resolution: `{env:FOO}` patterns in `apiKey` resolved to `process.env.FOO`

The `enabled` flag and other plugin options are re-read from the filesystem on every `chat.message` event (not cached at startup), allowing dynamic enable/disable without restarting OpenCode.

### 4. `session.prompt({ noReply: true })` for display

**Rationale**: `noReply: true` prevents the AI from responding to the tip message — it's treated as a system annotation. The tip appears inline in the chat view between the user message and the AI response. It persists visually for the session lifetime (satisfying "better to persist" vs toast).

**Format**: The tip message uses a `text` part with a machine-readable prefix:
```
[LANG-TIP] "goed" should be "went"
```

The `[LANG-TIP]` prefix is easily grepped (`grep '\[LANG-TIP\]'`) or stripped (e.g., `sed 's/^\[LANG-TIP\] //'`).

### 5. Async fire-and-forget with AbortController

**Rationale**: The LLM call must not block the main `chat.message` hook from returning (the AI needs to start responding immediately). Using `Promise.resolve().then()` or an immediately-invoked async function achieves this. To handle rapid-fire messages, an `AbortController` is stored per-session: when a new message arrives, the previous pending tip request is aborted before starting a new one.

```
chat.message → abort previous → fire new async request
                                    ↓
                              (non-blocking, AI responds immediately)
                                    ↓
                              showTip() when done
```

### 6. Code block handling: strip with placeholders

**Rationale**: Instead of classifying the entire message as code-or-not (which has false positives/negatives), remove only the code blocks and inline code, replacing them with context-preserving placeholders.

```
Original: "I tried using ```const x = [1,2,3]``` but `it` didn't work"
Processed: "I tried using [CODE BLOCK] but [CODE] didn't work"
→ LLM can analyze surrounding grammar without being confused by code syntax
```

**Alternative considered**: Regex-based code detection (keywords, brackets, assignments). Rejected — false positives on sentences like "I want to learn about Python `def` and `class`" and false negatives on prose-heavy code files.

### 7. System prompt: self-referential writing analysis with [OK] suppression

**Rationale**: The LLM must analyze the user's text as writing, not as a question to answer. Additionally, the LLM is instructed to return `[OK]` when it finds no issues — the plugin suppresses the tip entirely rather than showing a vacuous "looks good" message.

```
You are a writing coach in a terminal-based AI coding assistant. Analyze the user's text below for grammar, clarity, vocabulary, phrasing, and naturalness in whatever language it's written in. If the text is already well-written and natural in its language, respond ONLY with: [OK]. If you notice an issue, provide exactly one short, specific correction or improvement suggestion. Under 25 words. Output ONLY the tip or [OK] — no preamble, no quotation marks, no "The user should...". Example output: "done" is more natural than "did" here.
```

### 8. Two-layer language filtering

**Rationale**: Users writing in their native language shouldn't receive writing tips. The plugin uses two complementary layers: a fast client-side gate to skip unnecessary API calls, and an LLM-level filter as a safety net.

```
user input
    │
    ▼
┌──────────────────────────────┐
│ Layer 1: franc-min detect    │  ← Fast, no API call
│ if lang in nativeLanguages   │
│   → skip (save API call)    │
│ else → proceed               │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Layer 2: LLM request         │
│ if response === "[OK]" → skip│  ← Safety net for well-written
│ else → display tip           │     text in any language
└──────────────────────────────┘
```

**Layer 1 — Client-side detection (`franc-min`)**:
- Uses `franc-min` (~150KB, no native deps) to detect the language of the user's text
- Configured via `nativeLanguages: ["en", "zh"]` plugin option
- When detected language is in the list, the entire pipeline skips — no API call is made
- `franc-min` accuracy drops with short text (<15 words). False negatives (target language not detected) mean a redundant API call — acceptable. False positives (native language reconstructed as something else) mean an unnecessary tip — mildly annoying but harmless

**Layer 2 — LLM [OK] filtering**:
- The system prompt instructs the LLM to return `[OK]` for well-written text
- Plugin checks `response.startsWith("[OK]")` and suppresses the tip
- This handles edge cases Layer 1 misses: well-written text in a non-native language, very short messages, mixed-language inputs
- No extra API call — it's part of the same request

**Alternative considered**: Using `franc-min` alone with aggressive filtering. Rejected because short-text accuracy is poor for user messages like "add dark mode" or "how do I fix this". The LLM filter catches what franc misses.

**Alternative considered**: No language detection at all — sending every message to the LLM. Rejected because it wastes API calls for native language users and clutters the output with unnecessary [OK] checks.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| `session.prompt({ noReply: true })` creates a visible message in the session message list | Acceptable tradeoff for inline display; messages are small and unobtrusive. Can revisit TUI slot approach later. |
| Provider API call fails (rate limit, auth error, network) | Fail silently — tip is a nice-to-have. Log error to console but never throw into the main pipeline. |
| `opencode.json` config format changes across OpenCode versions | Use try/catch with fallback values. Plugin options provide an override path. |
| Rapid-fire messages cause concurrent API calls | Abort previous pending request per session before starting new one. One in-flight tip at a time. |
| Code placeholder replacement creates unnatural input ("[CODE BLOCK] did work") | Imperfect but better than analyzing code as prose. The writing coach prompt understands placeholders. |
| `franc-min` misdetects language for short text (<15 words) | False negative (target not detected) → redundant API call, acceptable. False positive (native flagged as other) → unnecessary tip, harmless. LLM `[OK]` filter catches remaining cases. |
| `nativeLanguages` config not set: every message goes to LLM | Default `nativeLanguages: []` means all messages get Layer 2 LLM filtering. Users SHOULD configure their native language to save API calls. Document this prominently. |

## Open Questions

- Should tips be collected/stored for a "writing review" feature at session end? (out of scope for initial version)