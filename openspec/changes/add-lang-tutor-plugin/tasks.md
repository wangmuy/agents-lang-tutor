## 1. Scaffold plugin structure

- [x] 1.1 Create `.opencode/plugin/lang-tutor/` directory
- [x] 1.2 Create `index.ts` with plugin skeleton: `Plugin` export, `chat.message` hook, `config` hook
- [x] 1.3 Verify plugin loads in opencode (check `opencode --verbose` output)

## 2. Config discovery

- [x] 2.1 Implement `readOpencodeConfig()` — reads `{worktree}/opencode.json` and `~/.config/opencode/opencode.json`, merges with project priority
- [x] 2.2 Implement `resolveProviderConfig(config, providerID, modelID)` — finds matching provider, extracts baseURL and apiKey, resolves `{env:NAME}` patterns; accepts modelID which may come from `tipModel` option (if configured) or fall back to `input.model.modelID`
- [x] 2.3 Implement `resolvePluginOptions(options)` — reads plugin options from the second element of the plugin array entry

## 3. Code block handling

- [x] 3.1 Implement `stripCodeBlocks(text)` — replaces ``` ``` blocks with `[CODE BLOCK]` and inline `` ` `` `` ` `` code with `[CODE]`
- [x] 3.2 Add tests: verify multi-block, inline, mixed, no-code scenarios

## 4. Language detection & filtering

- [x] 4.1 Add `franc-min` dependency (npm, ~150KB, no native deps)
- [x] 4.2 Implement `detectLanguage(text)` — wraps franc-min, returns ISO 639-3 code or `"und"` for undetermined
- [x] 4.3 Implement `isNativeLanguage(lang, nativeLanguages)` — checks if detected language is in the configured list
- [x] 4.4 Implement short-text heuristic: if text < 10 words, skip Layer 1 and fall through to LLM filtering
- [x] 4.5 Implement `isOKResponse(response)` — checks if LLM response starts with `[OK]` (trimmed), suppresses tip
- [x] 4.6 Wire into `chat.message` pipeline: strip code → detect lang → native? skip : fetch LLM → [OK]? skip : display

## 5. LLM tip request

- [x] 5.1 Define `SYSTEM_PROMPT` constant — writing coach prompt with [OK] instruction, under 25 words, self-referential, no Q&A
- [x] 5.2 Implement `fetchTip(baseURL, apiKey, modelID, systemPrompt, userText)` — POST to `/chat/completions` with `max_tokens: 50`, `temperature: 0.3`
- [x] 5.3 Handle errors: non-2xx status, network failure, empty response → silent return, `console.error` log

## 6. Display

- [x] 6.1 Implement `displayTip(client, sessionID, tip)` — calls `client.session.prompt({ noReply: true, parts: [{ type: "text", text: "[LANG-TIP] " + tip }] })`
- [x] 6.2 Skip display when tip is empty, whitespace, or `[OK]`

## 7. Async orchestration

- [x] 7.1 Implement `TipsQueue` class — tracks per-session `AbortController`, supports `enqueue(sessionID, fn)` that aborts previous and starts new
- [x] 7.2 Wire `chat.message` hook: guard (role, content, re-read enabled from config), strip code, detect language, native check, queue async tip request
- [x] 7.3 Ensure `chat.message` returns immediately (tip runs in background)

## 8. Plugin configuration

- [x] 8.1 Support `enabled` option (default `true`) — re-checked on every `chat.message` for dynamic enable/disable without restart
- [x] 8.2 Support `nativeLanguages` option — array of ISO 639-3 language codes (e.g., `["eng", "zho"]`), messages in these languages skip tip generation
- [x] 8.3 Support `forcedLanguage` option — injected into system prompt
- [x] 8.4 Support `cooldownMs` option — skip if last tip was less than cooldown ago
- [x] 8.5 Support `tipModel` option — override model used for tips (different from session model)

## 9. Integration & polish

- [x] 9.1 Add plugin entry to `opencode.json` with default options
- [x] 9.2 Add `franc-min` to `.opencode/package.json` dependencies
- [x] 9.3 End-to-end test: send messages in opencode, verify tips appear inline, tips don't clutter AI context, native language messages skip API call, rapid-fire is handled (manually verified)
- [x] 9.4 Verify code blocks are stripped with placeholders before LLM receives text
- [x] 9.5 Verify [OK] response from LLM suppresses the tip display

## 10. ISO 639 normalization (merged from switch-to-chat-message-hook)

- [x] 10.1 Add `ISO_639_1_TO_3` static lookup table mapping all 184 ISO 639-1 codes to ISO 639-3 codes
- [x] 10.2 Add `ISO_639_3_TO_NAME` static lookup table mapping ISO 639-3 codes to English language names
- [x] 10.3 Implement `normalizeTo6393(value)` — looks up 2-char codes, passes 3-char through
- [x] 10.4 Implement `normalizeNativeLanguages(nativeLanguages)` — normalizes and deduplicates
- [x] 10.5 Implement `resolveForcedLanguageName(forcedLanguage)` — normalizes to 639-3, resolves to name
- [x] 10.6 Wire normalization into `buildSystemPrompt`
- [x] 10.7 Wire normalization into `isNativeLanguage`

## 11. Hook switch: chat.message handler (merged from switch-to-chat-message-hook)

- [x] 11.1 Implement `chat.message` hook handler with full tip pipeline
- [x] 11.2 Implement bounded `messageID` dedup cache
- [x] 11.3 Use `input.model.modelID` from chat.message hook as fallback model ID
- [x] 11.4 Remove SDK message-fetch workaround
- [x] 11.5 Remove unbounded `processedMessages` Set
- [x] 11.6 Remove `tool.execute.before` handler (was disabled stub, now fully removed)

## 12. Sync/async mode & AbortController (merged from switch-to-chat-message-hook)

- [x] 12.1 Sync mode: await `runTip()` before returning
- [x] 12.2 Async mode: enqueue via TipsQueue (fire-and-forget)

## 13. Documentation updates (merged from switch-to-chat-message-hook)

- [x] 13.1 Update `IMPL-OPENCODE.md` — hook section describes `chat.message`
- [x] 13.2 Update `AGENTS.md` — hook line says `chat.message`
- [x] 13.3 Update `README.md` — ISO 639-1/639-3 examples in config table