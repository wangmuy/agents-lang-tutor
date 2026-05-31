## Why

OpenCode users writing in a non-native language (or refining their native language) get no feedback on their writing quality. Grammar mistakes, awkward phrasing, and unnatural word choices go uncorrected. This plugin intercepts every user message, requests a quick language tip from the same LLM being used for the session, and displays it inline — without polluting the AI's conversation context or the saved chat history.

## What Changes

- **New server plugin** hooks `chat.message` to intercept user messages
- Plugin reads the active model from `input.model` and discovers provider config (baseURL, apiKey) from `opencode.json` (project or user-home); if `tipModel` is configured, it overrides the active model
- Makes an independent `fetch()` call to the provider's OpenAI-compatible `/chat/completions` endpoint with a minimal system prompt requesting a grammar/writing tip
- Strips code blocks (```) and inline backtick code, replacing them with `[CODE BLOCK]` / `[CODE]` placeholders before analysis
- Two-layer language filtering to avoid unnecessary tips for native languages:
  - **Layer 1**: Fast client-side language detection (franc-min) to skip messages in `nativeLanguages` before any API call
  - **Layer 2**: LLM returns `[OK]` when text is already well-written — plugin suppresses the tip
- Displays the tip via `client.session.prompt({ noReply: true })` with `[LANG-TIP]` prefix — appears inline after the user message, not included in AI context, easily grepped/stripped
- Async fire-and-forget pattern: tip generation never blocks the main AI response
- Debounces rapid-fire messages: cancels pending tip requests when new user input arrives
- Plugin configurable via `opencode.json` plugin options: `nativeLanguages`, `forcedLanguage`, `tipModel`, `cooldownMs`, `enabled`

## Capabilities

### New Capabilities
- `lang-tutor-plugin`: Server plugin that provides inline language/writing tips for each user message by calling the configured LLM independently

### Modified Capabilities
<!-- None -->

## Impact

- New file: `.opencode/plugin/lang-tutor/index.ts` (server plugin source)
- Modifies: `opencode.json` (adds plugin entry with optional config)
- Dependencies: none beyond existing `@opencode-ai/plugin`
- No breaking changes