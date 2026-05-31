# LLM Pipeline [REQ-002]

## ADDED Requirements

### Requirement: Hook script SHALL strip code blocks before analysis [REQ-002.1]

The script SHALL remove fenced code blocks (```...```) and inline code (`...`) from the prompt text before sending to the LLM.

#### Scenario: Fenced code block is stripped
- **GIVEN** the prompt contains ```const x = 1```
- **WHEN** the script processes the prompt
- **THEN** the code block SHALL be replaced with `[CODE BLOCK]`

#### Scenario: Inline code is stripped
- **GIVEN** the prompt contains backtick-enclosed code like `` `map()` ``
- **WHEN** the script processes the prompt
- **THEN** the inline code SHALL be replaced with `[CODE]`

#### Scenario: No code in prompt passes through unchanged
- **GIVEN** the prompt contains no backticks or fenced blocks
- **WHEN** the script processes the prompt
- **THEN** the text SHALL pass through unchanged

### Requirement: LLM config SHALL be auto-resolved from Codex config files [REQ-002.2]

The script SHALL discover the active LLM provider configuration by scanning Codex config files in order: project `.codex/config.toml`, user `~/.codex/config.toml`, then profile configs `~/.codex/*.config.toml`.

#### Scenario: Provider found in project config
- **GIVEN** `.codex/config.toml` contains `model_providers` with a matching entry
- **WHEN** the script resolves the LLM config
- **THEN** the base URL and API key SHALL be extracted from that entry

#### Scenario: Provider found in profile config fallback
- **GIVEN** only the profile `~/.codex/cliproxyapi.config.toml` contains `model_providers`
- **WHEN** the script resolves the LLM config
- **THEN** the profile entry SHALL be used

#### Scenario: Missing config returns None
- **GIVEN** no config file contains `model_providers`
- **WHEN** the script resolves the LLM config
- **THEN** the script SHALL return `{"continue": true}` without making an LLM call

### Requirement: LLM call SHALL use writing-coach system prompt [REQ-002.3]

The script SHALL use a system prompt instructing the model to act as a writing coach, responding with `[OK]` for well-written text or a single short tip (<25 words) for issues.

#### Scenario: Well-written text produces [OK]
- **GIVEN** a well-written English sentence
- **WHEN** sent to the LLM with the system prompt
- **THEN** the response SHALL be `[OK]`

#### Scenario: Text with grammar issues produces a tip
- **GIVEN** text contains a grammatical error
- **WHEN** sent to the LLM with the system prompt
- **THEN** the response SHALL be a short correction tip (<25 words)
- **AND** SHALL NOT include preamble or quotation marks

### Requirement: Hook SHALL always return continue [REQ-002.4]

The script SHALL always output `{"continue": true}` to stdout, regardless of tip success or failure, and SHALL never block the user prompt.

#### Scenario: Tip fetch succeeds
- **GIVEN** the LLM responds with a tip
- **WHEN** the script completes
- **THEN** stdout SHALL contain `{"continue": true}`

#### Scenario: Tip fetch fails
- **GIVEN** the LLM request fails or times out
- **WHEN** the script completes
- **THEN** stdout SHALL contain `{"continue": true}`

#### Scenario: Empty prompt
- **GIVEN** the user prompt is empty or whitespace only
- **WHEN** the script executes
- **THEN** the script SHALL exit immediately with `{"continue": true}`
