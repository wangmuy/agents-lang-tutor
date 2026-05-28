## ADDED Requirements

### Requirement: Plugin intercepts user chat messages
The plugin SHALL register a `chat.message` hook that fires on every user message in any session.

#### Scenario: User sends a text message
- **WHEN** a user submits a message with `role: "user"` and non-empty `content`
- **THEN** the plugin processes the message for a language tip

#### Scenario: Non-user message arrives
- **WHEN** a message arrives with `role` other than `"user"` (e.g., `"assistant"`, `"system"`)
- **THEN** the plugin ignores the message and returns immediately

#### Scenario: User sends an empty message
- **WHEN** a user submits a message with empty `content`
- **THEN** the plugin ignores the message and returns immediately

---

### Requirement: Plugin discovers provider configuration
The plugin SHALL determine the provider's baseURL and apiKey by reading the project's `opencode.json` and the user's global `opencode.json`.

#### Scenario: Config found in project opencode.json
- **WHEN** `{ctx.worktree}/opencode.json` exists and contains a provider matching `input.model.providerID`
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
The plugin SHALL use language detection to skip tip generation when the user's text is in a configured native language.

#### Scenario: Text detected as native language
- **WHEN** `nativeLanguages` is configured (e.g., `["en", "zh"]`) and language detection identifies the user's text as one of those languages
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
- **THEN** the plugin logs the error to `console.error` and does not display any tip; no error is thrown into the main message pipeline

#### Scenario: System prompt instructs writing analysis
- **WHEN** the plugin sends the LLM request
- **THEN** the system prompt MUST instruct the model to analyze grammar, clarity, vocabulary, phrasing, and naturalness of the user's text (not answer the user's question), to return `[OK]` when text is well-written, and to keep output under 25 words

---

### Requirement: Plugin displays tip inline without AI context pollution
The plugin SHALL display the language tip using `client.session.prompt({ noReply: true })` with a text part containing a visual prefix.

#### Scenario: Tip displayed after user message
- **WHEN** the LLM returns a valid tip
- **THEN** `ctx.client.session.prompt()` is called with `noReply: true` and `parts: [{ type: "text", text: tip }]` for the current session

#### Scenario: Tip message format
- **WHEN** a tip is displayed
- **THEN** the text content SHALL begin with `[LANG-TIP]` prefix (e.g., `[LANG-TIP] "done" is more natural than "did" here`) to distinguish it from conversation messages and enable grep/strip automation

#### Scenario: noReply prevents AI from responding
- **WHEN** a tip message is sent with `noReply: true`
- **THEN** the AI agent does not process the tip as part of the conversation context

---

### Requirement: Plugin is non-blocking
The plugin SHALL initiate the LLM request asynchronously without blocking the return of the `chat.message` hook.

#### Scenario: AI responds while tip is being generated
- **WHEN** the plugin starts an async LLM request for the tip
- **THEN** the `chat.message` hook returns immediately, and the main AI begins generating its response without waiting for the tip

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
The plugin SHALL accept configuration through the `opencode.json` plugin entry's options array.

#### Scenario: Plugin enabled by default
- **WHEN** no `enabled` option is specified
- **THEN** the plugin is enabled

#### Scenario: Plugin disabled via config
- **WHEN** the plugin options include `{ "enabled": false }`
- **THEN** the plugin registers but returns immediately on every `chat.message` event

#### Scenario: forcedLanguage restricts tip language
- **WHEN** the plugin options include `{ "forcedLanguage": "Japanese" }`
- **THEN** the system prompt instructs the LLM to provide tips in Japanese about the Japanese writing quality of the user's text

#### Scenario: nativeLanguages gate prevents API calls for native languages
- **WHEN** the plugin options include `{ "nativeLanguages": ["en", "zh"] }`
- **THEN** messages whose detected language matches an entry in the list are skipped without any API call

#### Scenario: cooldownMs prevents back-to-back tips
- **WHEN** `cooldownMs` is set and the time since the last tip is less than the cooldown
- **THEN** the plugin skips tip generation for the current message