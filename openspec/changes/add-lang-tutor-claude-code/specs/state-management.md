## ADDED Requirements

### Requirement: State Management [REQ-005]

The hook SHALL maintain a cooldown mechanism to prevent showing tips too frequently.

The cooldown SHALL be tracked via a file at `/tmp/lang-tutor-cooldown-{session_id}` containing a Unix timestamp in milliseconds.

The hook SHALL NOT call the LLM or display a tip if a cooldown file exists and the time since its timestamp is less than `cooldownMs` (default 10000ms).

The hook SHALL update the cooldown file timestamp after each tip display.

The hook SHALL maintain a session-specific log file at `/tmp/lang-tutor-{session_id}.log`.

The log file SHALL record timestamps, event types, and error information.

The hook SHALL rotate the log file when it exceeds 5MB (rename to `.log.old`).

#### Scenario: Cooldown prevents duplicate tips
- **GIVEN** a tip was displayed 3 seconds ago (cooldownMs=10000)
- **WHEN** the user submits a new message
- **THEN** the hook skips the LLM call
- **AND** passes the prompt through to stdout

#### Scenario: Cooldown expires, tip allowed
- **GIVEN** a tip was displayed 12 seconds ago (cooldownMs=10000)
- **WHEN** the user submits a new message
- **THEN** the hook proceeds with the LLM call

#### Scenario: Logging on each invocation
- **GIVEN** the hook processes a user message
- **WHEN** an error or tip display occurs
- **THEN** the hook appends a log entry to `/tmp/lang-tutor-{session_id}.log`

#### Scenario: Log rotation
- **GIVEN** the log file exceeds 5MB
- **WHEN** the hook appends a new entry
- **THEN** the existing log is renamed to `.log.old`
- **AND** a new empty log file is created