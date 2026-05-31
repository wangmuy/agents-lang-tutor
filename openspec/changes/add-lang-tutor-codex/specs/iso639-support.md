# ISO 639 Normalization [REQ-004]

## ADDED Requirements

### Requirement: Language codes SHALL be normalized to ISO 639-3 [REQ-004.1]

The script SHALL normalize ISO 639-1 two-letter codes to ISO 639-3 three-letter codes for comparison with nativeLanguages values.

#### Scenario: Two-letter code is normalized
- **GIVEN** `nativeLanguages` contains `"en"`
- **WHEN** normalizing the list
- **THEN** `"en"` SHALL be converted to `"eng"`

#### Scenario: Three-letter code passes through unchanged
- **GIVEN** `nativeLanguages` contains `"eng"`
- **WHEN** normalizing the list
- **THEN** `"eng"` SHALL remain `"eng"`

#### Scenario: Language names are resolved for system prompt
- **GIVEN** `forcedLanguage` is `"es"`
- **WHEN** building the system prompt
- **THEN** the prompt SHALL use `"Spanish"` as the language name

#### Scenario: Duplicate codes are deduplicated
- **GIVEN** `nativeLanguages` contains `["en", "eng"]`
- **WHEN** normalizing the list
- **THEN** the result SHALL be `["eng"]` (deduplicated)
