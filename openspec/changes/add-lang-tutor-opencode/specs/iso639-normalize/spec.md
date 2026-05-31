## ADDED Requirements

### Requirement: ISO 639 code normalization [REQ-001]
The plugin SHALL normalize `nativeLanguages` and `forcedLanguage` config values to ISO 639-3 codes at runtime, accepting ISO 639-1 codes, ISO 639-3 codes, and common English language names.

#### Scenario: nativeLanguages with ISO 639-1 codes
- **WHEN** `nativeLanguages` is configured as `["en", "es", "zh"]`
- **THEN** each entry is normalized to its ISO 639-3 equivalent (`["eng", "spa", "zho"]`) before comparison with franc-min output

#### Scenario: nativeLanguages with ISO 639-3 codes
- **WHEN** `nativeLanguages` is configured as `["eng", "spa", "zho"]`
- **THEN** each entry passes through unchanged (already ISO 639-3)

#### Scenario: nativeLanguages with mixed codes
- **WHEN** `nativeLanguages` is configured as `["en", "eng", "zh"]`
- **THEN** entries are normalized and deduplicated (`["eng", "zho"]`)

#### Scenario: nativeLanguages with unrecognized code
- **WHEN** `nativeLanguages` contains a value that is not a valid ISO 639-1, ISO 639-3, or known language name
- **THEN** the entry is passed through unchanged (franc-min may still match it, or it will simply never match)

#### Scenario: forcedLanguage with ISO 639-1 code
- **WHEN** `forcedLanguage` is configured as `"es"`
- **THEN** the system prompt instructs the LLM to provide tips in "Spanish" (normalized from `"es"` → `"spa"` → `"Spanish"`)

#### Scenario: forcedLanguage with ISO 639-3 code
- **WHEN** `forcedLanguage` is configured as `"spa"`
- **THEN** the system prompt instructs the LLM to provide tips in "Spanish" (normalized from `"spa"` → `"Spanish"`)

#### Scenario: forcedLanguage with language name
- **WHEN** `forcedLanguage` is configured as `"Spanish"`
- **THEN** the system prompt instructs the LLM to provide tips in "Spanish" (name resolved directly)

#### Scenario: forcedLanguage with unrecognized value
- **WHEN** `forcedLanguage` is a value not found in any lookup table
- **THEN** the value is used verbatim in the system prompt (e.g., `"Esperanto"` would produce "provide tips in Esperanto")

#### Scenario: ISO 639-1 to 639-3 lookup completeness
- **WHEN** the plugin receives any ISO 639-1 code from the official 184 two-letter codes
- **THEN** the lookup table MUST return the corresponding ISO 639-3 code

#### Scenario: ISO 639-3 to language name lookup completeness
- **WHEN** the plugin receives any ISO 639-3 code that has an ISO 639-1 equivalent
- **THEN** the lookup table MUST return the corresponding English language name