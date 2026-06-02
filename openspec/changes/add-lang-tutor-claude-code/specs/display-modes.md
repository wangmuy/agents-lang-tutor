## ADDED Requirements

### Requirement: Display Modes [REQ-004]

The hook SHALL support two display methods for tips, controlled by the `displayMethod` config field.

**stderr mode** (`"stderr"`, default):
- The hook SHALL write the tip to stderr using ANSI escape sequences: yellow text with a sparkle emoji prefix
- In **sync** mode: the hook SHALL display the tip, maintain it on screen for `toastDurationMs`, then clear the line with an ANSI erase-sequence
- In **async** mode: the hook SHALL write the tip to stderr and exit immediately without clearing the tip

**systemMessage mode** (`"systemMessage"`):
- The hook SHALL output a JSON object on stdout: `{"continue": true, "systemMessage": "[Lang-Tip] {tip}"}`
- Mode (sync/async) does NOT affect systemMessage behavior

The hook SHALL truncate tips to 80 characters in stderr mode for display.

The hook SHALL truncate tips to 200 characters in systemMessage mode.

#### Scenario: stderr display in sync mode
- **GIVEN** `displayMethod` is `"stderr"` and `mode` is `"sync"`
- **WHEN** the LLM returns a tip
- **THEN** the hook writes an ANSI yellow bar with the tip to stderr
- **AND** the hook writes the original prompt to stdout immediately
- **AND** the hook keeps the process alive for `toastDurationMs`
- **AND** the hook clears the stderr line with an ANSI erase sequence before exiting

#### Scenario: stderr display in async mode
- **GIVEN** `displayMethod` is `"stderr"` and `mode` is `"async"`
- **WHEN** the LLM returns a tip
- **THEN** the hook writes an ANSI yellow bar with the tip to stderr
- **AND** the hook writes the original prompt to stdout
- **AND** the hook exits immediately (tip persists in terminal scrollback)

#### Scenario: systemMessage display
- **GIVEN** `displayMethod` is `"systemMessage"`
- **WHEN** the LLM returns a tip
- **THEN** the hook outputs `{"continue": true, "systemMessage": "[Lang-Tip] ..."}` on stdout
- **AND** the hook exits 0

#### Scenario: No tip means no display
- **GIVEN** the LLM returns `[OK]`
- **WHEN** the hook processes the response
- **THEN** no stderr or systemMessage output is produced
- **AND** the hook writes the original prompt to stdout and exits 0