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
- [ ] 9.3 End-to-end test: send messages in opencode, verify tips appear inline, tips don't clutter AI context, native language messages skip API call, rapid-fire is handled
- [x] 9.4 Verify code blocks are stripped with placeholders before LLM receives text
- [x] 9.5 Verify [OK] response from LLM suppresses the tip display