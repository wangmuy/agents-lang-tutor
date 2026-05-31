# Toast Display & Cooldown [REQ-003]

## ADDED Requirements

### Requirement: Tips SHALL be displayed as temporary ANSI terminal toasts [REQ-003.1]

The script SHALL display tips using ANSI escape sequences on stderr, creating a temporary yellow notification bar that auto-clears.

#### Scenario: Tip is displayed as ANSI toast
- **GIVEN** the LLM returned a tip
- **WHEN** the script processes the response
- **THEN** an ANSI escape sequence SHALL be written to stderr
- **AND** the tip text SHALL be prefixed with `✨ [Lang-Tip]:`
- **AND** the text SHALL be colored yellow (ANSI code 33)

#### Scenario: Toast auto-clears after configured duration
- **GIVEN** `toastDurationMs` is set to `5000` in config
- **WHEN** the toast is displayed
- **THEN** the line SHALL be cleared from the terminal after 5 seconds

#### Scenario: Long tips are truncated
- **GIVEN** the tip text exceeds 80 characters
- **WHEN** displayed as a toast
- **THEN** the toast SHALL truncate to 80 characters with `...`

#### Scenario: systemMessage is returned alongside continue
- **GIVEN** a tip is produced
- **WHEN** the script outputs JSON to stdout
- **THEN** the output SHALL include `"systemMessage"` with `[Lang-Tip]` prefix

### Requirement: Cooldown SHALL prevent rapid-fire tips [REQ-003.2]

The script SHALL track the last tip time in a file at `/tmp/lang-tutor-cooldown` and suppress tips until the cooldown period elapses.

#### Scenario: Cooldown suppresses tips
- **GIVEN** a tip was shown less than `cooldownMs` ago
- **WHEN** the hook fires
- **THEN** the script SHALL return `{"continue": true}` without making an LLM call

#### Scenario: Cooldown expires allows tips
- **GIVEN** the cooldown period has elapsed since the last tip
- **WHEN** the hook fires
- **THEN** the script SHALL proceed with normal processing

#### Scenario: Cooldown disabled with zero
- **GIVEN** `cooldownMs` is `0` in config
- **WHEN** the hook fires
- **THEN** cooldown check SHALL be skipped
