## ADDED Requirements

### Requirement: Plugin intercepts user chat messages
The plugin SHALL register a `chat.message` hook that fires on every user message in any session. The hook receives `sessionID`, `model` (providerID + modelID), `messageID`, and the user message content via `output.parts`.

#### Scenario: User sends a text message via chat.message hook
- **WHEN** a user submits a message and the `chat.message` hook fires with `output.parts` containing text content
- **THEN** the plugin extracts text from `TextPart` entries in `output.parts`, concatenates them, and processes the message for a language tip

#### Scenario: Non-user message arrives via chat.message hook
- **WHEN** a `chat.message` event fires with a message whose `role` is not `"user"`
- **THEN** the plugin ignores the message and returns immediately

#### Scenario: User sends an empty message via chat.message hook
- **WHEN** a `chat.message` event fires and all `TextPart` entries in `output.parts` have empty `text` fields
- **THEN** the plugin ignores the message and returns immediately

#### Scenario: Dedup via messageID
- **WHEN** the `chat.message` hook fires with a `messageID` that was already processed in the same session
- **THEN** the plugin skips tip generation for that message (bounded dedup cache, last 100 messageIDs per session)

---

### Requirement: Plugin discovers provider configuration
The plugin SHALL determine the provider's baseURL and apiKey by reading the project's `opencode.json` and the user's global `opencode.json`. The model ID SHALL come from `input.model.modelID` (from the `chat.message` hook) unless overridden by the `tipModel` plugin option.

#### Scenario: Model from chat.message hook input
- **WHEN** the `chat.message` hook provides `input.model.modelID` and no `tipModel` plugin option is set
- **THEN** the plugin uses `input.model.modelID` to resolve the provider configuration

#### Scenario: tipModel overrides hook model
- **WHEN** the `tipModel` plugin option is set
- **THEN** the plugin uses `tipModel` instead of `input.model.modelID` to resolve the provider configuration

#### Scenario: Config found in project opencode.json
- **WHEN** `{ctx.worktree}/opencode.json` exists and contains a provider matching the resolved model ID
- **THEN** the plugin extracts `baseURL` and `apiKey` from that provider's `options` and resolves `{env:NAME}` patterns to `process.env`

#### Scenario: Config found in user home opencode.json
- **WHEN** no project-level `opencode.json` exists but `{os.homedir()}/.config/opencode/opencode.json` exists and contains the provider
- **THEN** the plugin uses that config

#### Scenario: Env var resolution in apiKey
- **WHEN** `apiKey` contains a value like `"{env:CLIPROXY_API_KEY}"`
- **THEN** the plugin resolves it to `process.env.CLIPROXY_API_KEY`

#### Scenario: Config not found
- **WHEN** no `opencode.json` is found or the provider is not configured in it
- **THEN** the plugin silently returns without attempting any LLM call

---

### Requirement: Plugin strips code with placeholders
The plugin SHALL replace fenced code blocks and inline backtick code with placeholder tokens before sending text to the LLM.

#### Scenario: Fenced code block present
- **WHEN** user input contains a triple-backtick fenced code block like ` ```const x = 1``` `
- **THEN** the code block is replaced with `[CODE BLOCK]`

#### Scenario: Inline code present
- **WHEN** user input contains inline backtick code like `` `const x = 1` ``
- **THEN** the inline code is replaced with `[CODE]`

#### Scenario: No code present
- **WHEN** user input contains no backtick-delimited code
- **THEN** the text is passed through unchanged

#### Scenario: Multiple code blocks
- **WHEN** user input contains multiple fenced blocks and inline code spans
- **THEN** each is independently replaced with the appropriate placeholder

---

### Requirement: Plugin filters native language via client-side detection
The plugin SHALL use language detection to skip tip generation when the user's text is in a configured native language. Both ISO 639-1 and ISO 639-3 codes SHALL be accepted for `nativeLanguages` (normalized internally).

#### Scenario: Text detected as native language
- **WHEN** `nativeLanguages` is configured (e.g., `["en", "zh"]`) and language detection identifies the user's text as one of those languages (after normalization to ISO 639-3)
- **THEN** the plugin skips tip generation entirely for that message without making any API call

#### Scenario: No nativeLanguages configured
- **WHEN** `nativeLanguages` is not configured or is an empty array
- **THEN** the plugin proceeds to Layer 2 (LLM filtering) for all messages

#### Scenario: Short text causes detection uncertainty
- **WHEN** the user's text is shorter than 10 words and language detection returns a low-confidence result
- **THEN** the plugin falls through to Layer 2 (LLM filtering) rather than risking a false positive skip

#### Scenario: Text detected as non-native language
- **WHEN** language detection identifies the text as a language not in `nativeLanguages`
- **THEN** the plugin proceeds to the LLM tip request

---

### Requirement: Plugin suppresses tip when LLM returns [OK]
The plugin SHALL suppress the tip display when the LLM responds that the text is already well-written.

#### Scenario: LLM returns [OK]
- **WHEN** the LLM response text starts with `[OK]`
- **THEN** the plugin does not display any tip

#### Scenario: LLM returns [OK] with trailing whitespace
- **WHEN** the LLM response text is `[OK]` followed by optional whitespace only
- **THEN** the plugin treats it as an [OK] response and suppresses the tip

#### Scenario: LLM returns a real tip
- **WHEN** the LLM response contains a writing tip (does not start with `[OK]`)
- **THEN** the plugin displays the tip normally

---

### Requirement: Plugin requests a writing tip from the LLM
The plugin SHALL make an independent HTTP POST to `<baseURL>/chat/completions` with a writing-coach system prompt and the processed user text.

#### Scenario: Successful tip generation
- **WHEN** the LLM responds with a short correction or improvement suggestion
- **THEN** the plugin trims whitespace and displays the tip

#### Scenario: Empty or whitespace-only response
- **WHEN** the LLM response text is empty or only whitespace after trimming
- **THEN** the plugin does not display any tip

#### Scenario: API call fails
- **WHEN** the `fetch()` call throws an error or returns a non-2xx status
- **THEN** the plugin logs the error and does not display any tip; no error is thrown into the main message pipeline

#### Scenario: System prompt instructs writing analysis
- **WHEN** the plugin sends the LLM request
- **THEN** the system prompt MUST instruct the model to analyze grammar, clarity, vocabulary, phrasing, and naturalness of the user's text (not answer the user's question), to return `[OK]` when text is well-written, and to keep output under 25 words

---

### Requirement: Plugin displays tip inline without AI context pollution
The plugin SHALL display the language tip using `client.session.prompt({ noReply: true })` with a text part containing a visual prefix, or via toast notification.

#### Scenario: Tip displayed after user message
- **WHEN** the LLM returns a valid tip and `displayMethod` is `"prompt"`
- **THEN** `ctx.client.session.prompt()` is called with `noReply: true` and `parts: [{ type: "text", text: tip }]` for the current session

#### Scenario: Tip displayed as toast
- **WHEN** the LLM returns a valid tip and `displayMethod` is `"toast"`
- **THEN** `ctx.client.tui.publish()` is called with a toast message containing the tip

#### Scenario: Tip message format
- **WHEN** a tip is displayed
- **THEN** the text content SHALL begin with `[LANG-TIP]` prefix to distinguish it from conversation messages and enable grep/strip automation

#### Scenario: noReply prevents AI from responding
- **WHEN** a tip message is sent with `noReply: true`
- **THEN** the AI agent does not process the tip as part of the conversation context

---

### Requirement: Plugin is non-blocking (sync/async mode)
In `mode: "async"`, the plugin SHALL initiate the LLM request without blocking the return of the `chat.message` hook. In `mode: "sync"` (default), the plugin SHALL await the LLM request before returning, because some providers only allow one request at a time.

#### Scenario: Async mode — AI responds while tip is being generated
- **WHEN** `mode` is `"async"` and the plugin starts an LLM request for the tip
- **THEN** the `chat.message` hook returns immediately, and the main AI begins generating its response without waiting for the tip

#### Scenario: Sync mode — tip completes before AI starts
- **WHEN** `mode` is `"sync"` and the plugin starts an LLM request for the tip
- **THEN** the `chat.message` hook awaits the tip request, and the main AI does not begin processing until the tip request completes (or fails)

---

### Requirement: Plugin handles rapid-fire messages
The plugin SHALL abort any in-flight tip request for a session when a new user message arrives in the same session.

#### Scenario: User sends a second message before tip arrives
- **WHEN** a user sends message B while a tip request for message A is still pending in the same session
- **THEN** the pending request for message A is aborted via AbortController before starting a new request for message B

#### Scenario: User sends message in a different session
- **WHEN** a user sends a message in session 2 while a tip request is pending in session 1
- **THEN** the tip for session 1 continues independently; each session tracks its own abort controller

---

### Requirement: Plugin is configurable via plugin options
The plugin SHALL accept configuration through the `opencode.json` plugin entry's options array. Both ISO 639-1 and ISO 639-3 codes SHALL be accepted for `nativeLanguages`. ISO 639-1 codes, ISO 639-3 codes, and common English language names SHALL be accepted for `forcedLanguage`.

#### Scenario: Plugin enabled by default
- **WHEN** no `enabled` option is specified
- **THEN** the plugin is enabled

#### Scenario: Plugin disabled via config
- **WHEN** the plugin options include `{ "enabled": false }`
- **THEN** the plugin registers but returns immediately on every `chat.message` event

#### Scenario: forcedLanguage with ISO 639-1 code
- **WHEN** the plugin options include `{ "forcedLanguage": "es" }`
- **THEN** the system prompt instructs the LLM to provide tips in "Spanish" about the Spanish writing quality of the user's text

#### Scenario: forcedLanguage with language name
- **WHEN** the plugin options include `{ "forcedLanguage": "Japanese" }`
- **THEN** the system prompt instructs the LLM to provide tips in "Japanese" about the Japanese writing quality of the user's text

#### Scenario: nativeLanguages with mixed ISO codes
- **WHEN** the plugin options include `{ "nativeLanguages": ["en", "zh", "eng"] }`
- **THEN** messages whose detected language (ISO 639-3) matches a normalized entry in the list are skipped without any API call

#### Scenario: cooldownMs prevents back-to-back tips
- **WHEN** `cooldownMs` is set and the time since the last tip is less than the cooldown
- **THEN** the plugin skips tip generation for the current message