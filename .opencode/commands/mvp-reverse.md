---
description: Reverse-engineer behavioral specs from existing source code into BDD shadow specs
---

Reverse-engineer behavioral specifications from existing undocumented
source code into BDD shadow specs with fidelity assessment.

**Input**: Optionally specify source path, module name, or file patterns
after `/mvp:reverse`. Example: `/mvp:reverse src/auth/` or `/mvp:reverse backend/db/`.

---

**Skills**: Check `openspec/skills-profile.yaml` for suggested community
skills under key `mvp-reverse`. Offer to load them — user decides.
## Steps

### 1. Gather source scope

Use the **AskUserQuestion tool**:

1. Which source code paths to analyze? (dirs, file patterns)
2. What module name should the specs use?
3. Any known behavioral boundaries or interfaces?

### 2. Create the code-to-spec change

```bash
openspec new change reverse-<module-name> --schema code-to-spec
```

### 3. Generate reverse-engineering report

Use `openspec instructions reverse-engineering --change "reverse-<name>" --json`.

- **Source Inventory**: All files being analyzed (Language, Lines, Domain)
- **Extracted Specifications**: For each behavioral unit:
  - BDD requirements with [REQ-CODE-XXX] IDs
  - Given/When/Then scenarios
  - Focus on OBSERVABLE BEHAVIOR (inputs, outputs, errors, side effects)
  - Do NOT describe internal implementation details
  - Do NOT guess at intent — report what the code actually does
- **Fidelity Report**: Confidence per extraction
  - High: code path is clear
  - Medium: some branching unclear
  - Low: complex or obfuscated
  - Uncovered Behavior: code paths whose purpose is unclear
  - Dead Code Suspects: code paths that appear unreachable
- **Integration Surface**: APIs, public functions, module exports
  (signature, expected inputs, return values, error modes)

### 4. Generate fidelity-report

- **Coverage Assessment**: Percentage of code paths documented
- **Ambiguity Report**: Behaviors AI could not confidently extract
- **Gap Recommendations**: Concrete actions (add tests, document contracts)
- **Spec Promotion Candidates**: High-confidence extractions suitable
  for promotion to authoritative specs (requires human review)

### 5. Create shadow specs

```bash
mkdir -p openspec/vendor-specs/<module-name>
# Write extracted BDD specs with [REQ-CODE-XXX] IDs
```

### 6. Show summary

```
## Reverse Engineering Complete: <module-name>

### Analysis
| Files | Lines | Domains Covered |
|-------|-------|-----------------|
| 12    | 2340  | auth, session   |

### Fidelity
| Extraction | Confidence | Notes |
|-----------|------------|-------|
| Login flow | High       | Clear happy path |
| Token refresh | High   | Well-defined error modes |
| Logout     | Medium     | Session cleanup ambiguous |

### Output
openspec/vendor-specs/<module-name>/spec.md

### Recommended
→ Create change to add tests for uncovered error paths
→ Promote token-refresh spec to authoritative (95% confidence)
→ Update architecture.md with this module's integration surface
```

## Guardrails

- Shadow specs are REFERENCE ONLY — do NOT participate in delta merge
- Report what the code ACTUALLY DOES, not what it should do
- Distinguish between observed behavior and inferred intent
- Flag dead code and ambiguous paths explicitly
- Spec promotion requires human review — never auto-promote
## Help

When invoked with `help` or `--help`:

```
/mvp:reverse — reverse-engineer specs from undocumented code

Usage:
  /mvp:reverse [path-or-module]

Workflow:
  reverse-engineering → fidelity-report → vendor-specs/<module>/spec.md

Examples:
  /mvp:reverse                          # prompt for paths
  /mvp:reverse src/auth/                # specific source dir
  /mvp:reverse backend/db               # module name
```
