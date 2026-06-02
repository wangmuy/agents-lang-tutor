## ADDED Requirements

### Requirement: LLM Config Resolution [REQ-003]

The hook SHALL resolve LLM API credentials in the following priority order:

1. `.claude/settings.json` — project-level Claude Code settings (look for `langTutor.apiKey`, `langTutor.baseUrl`, etc.)
2. `~/.claude/settings.json` — user-level Claude Code settings
3. `ANTHROPIC_AUTH_TOKEN` environment variable
4. `ANTHROPIC_API_KEY` environment variable
5. Built-in defaults: `api.anthropic.com` base URL, `claude-sonnet-4-6` model

If `tipModel` is specified in the hook config, it SHALL override the resolved model from settings.

The hook SHALL default to the Anthropic Messages API wire format (`/v1/messages`).

If no API key or auth token is found, the hook SHALL silently skip without calling the LLM (pass prompt through, exit 0).

#### Scenario: API key from environment variable
- **GIVEN** `ANTHROPIC_API_KEY` is set to a valid key
- **WHEN** the hook starts
- **THEN** it uses that key to authenticate the LLM API call

#### Scenario: Settings file provides config
- **GIVEN** `~/.claude/settings.json` contains a `langTutor` object with `apiKey`
- **WHEN** the hook starts
- **THEN** it reads the API key from the settings file (higher priority than env vars)

#### Scenario: No credentials found
- **GIVEN** no settings file, no `ANTHROPIC_AUTH_TOKEN`, and no `ANTHROPIC_API_KEY`
- **WHEN** the hook starts
- **THEN** it writes the original prompt to stdout and exits 0 without calling the LLM

#### Scenario: tipModel override
- **GIVEN** the config specifies `"tipModel": "claude-haiku-4-5-20251001"`
- **WHEN** the hook resolves the LLM config
- **THEN** it uses `claude-haiku-4-5-20251001` regardless of the model in settings

#### Scenario: Credential priority order
- **GIVEN** both `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` are set
- **WHEN** the hook resolves credentials
- **THEN** `ANTHROPIC_AUTH_TOKEN` takes priority over `ANTHROPIC_API_KEY`