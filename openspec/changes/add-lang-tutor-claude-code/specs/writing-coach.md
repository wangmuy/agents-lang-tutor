## ADDED Requirements

### Requirement: Writing Coach [REQ-001]

The hook SHALL analyze the user's prompt text for grammar, clarity, vocabulary, phrasing, and naturalness in whatever language it is written in.

The hook SHALL strip code blocks from the user's text before sending it to the LLM (fenced code blocks ```...``` SHALL be replaced with a placeholder; inline code `...` SHALL be replaced with a placeholder).

The hook SHALL call the LLM with a system prompt instructing it to produce at most one short tip under 25 words if an issue is found, or respond with `[OK]` if the text is already well-written and natural.

The hook SHALL pass the user's original unmodified prompt through to stdout, regardless of whether a tip is produced.

The hook SHALL NOT block the user's prompt processing under any circumstances.

The hook SHALL silently ignore messages shorter than a configurable minimum length threshold.

#### Scenario: Well-written text produces no tip
- **GIVEN** the user types "I need to fix the authentication bug in the login handler"
- **WHEN** the hook calls the LLM with the writing-coach system prompt
- **THEN** the LLM responds with `[OK]`
- **AND** the hook writes the original prompt to stdout and exits 0

#### Scenario: Grammar issue produces a tip
- **GIVEN** the user types "I did that yesterday and it work fine"
- **WHEN** the hook calls the LLM with the writing-coach system prompt
- **THEN** the LLM responds with a tip like "Use 'worked' instead of 'work' (past tense)"
- **AND** the hook displays the tip via the configured display method
- **AND** the hook writes the original prompt to stdout and exits 0

#### Scenario: Code blocks are stripped before LLM call
- **GIVEN** the user types "Check this: `const x = 1` — is that right?"
- **WHEN** the hook strips code blocks
- **THEN** the LLM receives "Check this: [CODE] — is that right?"
- **AND** the original prompt is passed through to stdout unchanged

#### Scenario: Very short message is silently skipped
- **GIVEN** the user types "ok" or "yes"
- **WHEN** the hook evaluates the message length
- **THEN** the hook writes the original prompt to stdout and exits 0 without calling the LLM