## ADDED Requirements

### Requirement: Config Management [REQ-002]

The hook SHALL load configuration from `.claude/lang-tutor/config.json`.

The configuration file SHALL support the following fields with these defaults:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Master switch |
| `nativeLanguages` | string[] | `[]` | ISO language codes the user is native in (no tips shown for these) |
| `forcedLanguage` | string or null | `null` | Force coaching in a specific language |
| `cooldownMs` | integer | `10000` | Milliseconds between tip displays |
| `tipModel` | string or null | `null` | Override the LLM model for tips |
| `displayMethod` | string | `"stderr"` | `"stderr"` or `"systemMessage"` |
| `toastDurationMs` | integer | `5000` | Duration of stderr toast display (ms) |
| `mode` | string | `"sync"` | `"sync"` (blocking, auto-clear) or `"async"` (non-blocking, persistent) |
| `baseUrl` | string or null | `null` | Override the Anthropic API base URL |
| `wireApi` | string or null | `null` | `"messages"` for Anthropic, `"chat"` for OpenAI-compatible |

The hook SHALL apply config changes on the next invocation without requiring a restart.

The hook SHALL treat `enabled: false` as a skip — no LLM call, no tip display, pass prompt through.

The `nativeLanguages` field SHALL support both ISO 639-1 (2-letter) and ISO 639-3 (3-letter) codes.

The `forcedLanguage` field SHALL accept ISO 639-1, ISO 639-3, or a language name.

#### Scenario: Config loaded on each invocation
- **GIVEN** the config file exists at `.claude/lang-tutor/config.json`
- **WHEN** the hook starts
- **THEN** it reads and parses the JSON file
- **AND** applies the config values for this invocation

#### Scenario: Disabled plugin passes prompt through
- **GIVEN** the config has `"enabled": false`
- **WHEN** the hook starts
- **THEN** it writes the original prompt to stdout and exits 0 without calling the LLM

#### Scenario: Missing config file uses defaults
- **GIVEN** `.claude/lang-tutor/config.json` does not exist
- **WHEN** the hook starts
- **THEN** it uses built-in default values for all settings

#### Scenario: Malformed config falls back to defaults
- **GIVEN** the config file contains invalid JSON
- **WHEN** the hook starts
- **THEN** it logs the error and uses built-in default values