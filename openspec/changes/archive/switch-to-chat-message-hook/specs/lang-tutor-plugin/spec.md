## MODIFIED Requirements

### Requirement: Plugin intercepts user chat messages [REQ-002]
The plugin SHALL register a `chat.message` hook that fires on every user message in any session. The hook receives `sessionID`, `model` (providerID + modelID), `messageID`, and the user message content via `output.parts`. The previous `tool.execute.before` hook SHALL be disabled (log warning and return immediately) and removed after verification.

#### Scenario: User sends a text message via chat.message hook
- **WHEN** a user submits a message and the `chat.message` hook fires with `output.parts` containing text content
- **THEN** the plugin extracts text from `TextPart` entries in `output.parts`, concatenates them, and processes the message for a language tip

#### Scenario: Non-user message arrives via chat.message hook
- **WHEN** a `chat.message` event fires with a message whose `role` is not `"user"`
- **THEN** the plugin ignores the message and returns immediately

#### Scenario: User sends an empty message via chat.message hook
- **WHEN** a `chat.message` event fires and all `TextPart` entries in `output.parts` have empty `text` fields
- **THEN** the plugin ignores the message and returns immediately

#### Scenario: tool.execute.before hook is disabled
- **WHEN** a `tool.execute.before` event fires
- **THEN** the plugin logs a warning message and returns immediately without processing

#### Scenario: Dedup via messageID
- **WHEN** the `chat.message` hook fires with a `messageID` that was already processed in the same session
- **THEN** the plugin skips tip generation for that message (bounded dedup cache, last 100 messageIDs per session)

---

### Requirement: Plugin discovers provider configuration [REQ-002]
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

### Requirement: Plugin is non-blocking [REQ-002]
In `mode: "async"`, the plugin SHALL initiate the LLM request without blocking the return of the `chat.message` hook. In `mode: "sync"`, the plugin SHALL await the LLM request before returning, because some providers only allow one request at a time.

#### Scenario: Async mode — AI responds while tip is being generated
- **WHEN** `mode` is `"async"` and the plugin starts an LLM request for the tip
- **THEN** the `chat.message` hook returns immediately, and the main AI begins generating its response without waiting for the tip

#### Scenario: Sync mode — tip completes before AI starts
- **WHEN** `mode` is `"sync"` and the plugin starts an LLM request for the tip
- **THEN** the `chat.message` hook awaits the tip request, and the main AI does not begin processing until the tip request completes (or fails)

---

### Requirement: Plugin handles rapid-fire messages [REQ-002]
The plugin SHALL abort any in-flight tip request for a session when a new user message arrives in the same session.

#### Scenario: User sends a second message before tip arrives
- **WHEN** a user sends message B while a tip request for message A is still pending in the same session
- **THEN** the pending request for message A is aborted via AbortController before starting a new request for message B

#### Scenario: User sends message in a different session
- **WHEN** a user sends a message in session 2 while a tip request is pending in session 1
- **THEN** the tip for session 1 continues independently; each session tracks its own abort controller

---

### Requirement: Plugin is configurable via plugin options [REQ-002]
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

## REMOVED Requirements

### Requirement: Plugin fetches session messages via SDK to find user content
**Reason**: The `chat.message` hook provides user message content directly via `output.parts`. No need to fetch session messages via `ctx.client.session.messages()` and walk backwards to find the latest user message.
**Migration**: Message content is now extracted from `output.parts` in the `chat.message` hook handler. The `processedMessages` unbounded Set is replaced with a bounded `messageID` dedup cache (last 100 per session).