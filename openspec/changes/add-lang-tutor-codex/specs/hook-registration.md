# Hook Registration & Config [REQ-001]

## ADDED Requirements

### Requirement: Hook registration SHALL declare UserPromptSubmit event [REQ-001.1]

The `.codex/hooks.json` file SHALL register a `UserPromptSubmit` hook event with a command pointing to `.codex/lang-tutor/hook.py`.

#### Scenario: Hook is registered and discovered
- **GIVEN** the project `.codex/hooks.json` file exists
- **WHEN** Codex starts a session in the project root
- **THEN** Codex SHALL discover the `UserPromptSubmit` hook entry

#### Scenario: Hook requires trust before execution
- **GIVEN** a new hook is registered in `.codex/hooks.json`
- **WHEN** Codex loads the hook for the first time
- **THEN** the hook SHALL be listed in the `/hooks` manager as requiring trust

#### Scenario: Hook fires on user prompt
- **GIVEN** the hook is trusted
- **WHEN** the user submits any prompt in Codex
- **THEN** the command SHALL execute before the prompt is sent to the LLM
- **AND** stdin SHALL contain a JSON object with a `prompt` field

### Requirement: Runtime config SHALL support live reload [REQ-001.2]

The `.codex/lang-tutor/config.json` file SHALL be read on every hook invocation, not cached at startup.

#### Scenario: Config is read on every invocation
- **GIVEN** `.codex/lang-tutor/config.json` exists with `{"enabled": true}`
- **WHEN** the hook script starts
- **THEN** the config SHALL be read from disk
- **AND** changes to the config SHALL take effect on the next invocation without restarting Codex

#### Scenario: Disabled config suppresses all processing
- **GIVEN** `config.json` has `{"enabled": false}`
- **WHEN** the hook fires
- **THEN** the script SHALL return `{"continue": true}` immediately
- **AND** SHALL NOT make any LLM calls or display any tips

### Requirement: Config SHALL support nativeLanguages option [REQ-001.3]

The config SHALL accept a `nativeLanguages` array of ISO 639-1 or 639-3 codes, and the system prompt SHALL instruct the LLM to skip tips for these languages.

#### Scenario: Native language suppresses tips
- **GIVEN** `nativeLanguages` is `["en"]`
- **WHEN** the user submits a prompt in English
- **THEN** the LLM SHALL be instructed to respond `[OK]` for English text

### Requirement: Config SHALL support forcedLanguage option [REQ-001.4]

The config SHALL accept a `forcedLanguage` value (ISO 639-1, 639-3, or language name), and the system prompt SHALL instruct the LLM to always coach in that language.

#### Scenario: Forced language produces language-specific coaching
- **GIVEN** `forcedLanguage` is `"Spanish"`
- **WHEN** the user submits a prompt
- **THEN** the LLM system prompt SHALL instruct coaching specifically in Spanish
