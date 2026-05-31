---
description: Ingest external/vendor/brownfield documents into BDD shadow specs with gap analysis
---

Ingest external documents (Swagger, PDF, Wiki, Postman collections)
into OpenSpec-compatible BDD shadow specs with gap analysis.

**Input**: Optionally specify source name or description after `/mvp:ingest`.

---

**Skills**: Check `openspec/skills-profile.yaml` for suggested community
skills under key `mvp-ingest`. Offer to load them — user decides.
## Steps

### 1. Gather sources

Use the **AskUserQuestion tool**:

1. What sources do you have? (URLs, file paths, API docs, Swagger specs)
2. What domain or epic does this relate to?
3. Is this a vendor API, legacy system, or external dependency?

### 2. Create the external-ingest change

```bash
openspec new change ingest-<source-name> --schema external-ingest
```

### 3. Generate source-manifest

Use `openspec instructions source-manifest --change "ingest-<name>" --json`.

For each source, record: Source ID ([VNDR-XXX] or [LEGACY-XXX]), Type
(Swagger/PDF/Word/Wiki/Postman), Location, Provider, Version, Relevance.

### 4. Generate spec-extraction

For each source in the manifest, extract behavioral specs:

- **Extracted Specs**: BDD format with [REQ-VENDOR-XXX] IDs.
  Given/When/Then scenarios. Focus on EXTERNAL BEHAVIOR.
  For APIs: extract request/response contracts.
  For docs: extract business rules and user scenarios.
- **Fidelity Assessment**: Confidence (High/Med/Low), assumptions, missing info.
- **Integration Contract**: Input/output contracts, error handling, SLA.

Mark ALL extracted specs as "Shadow Specs — vendor-maintained."
Store in `openspec/vendor-specs/<source-name>/spec.md`.

### 5. Generate gap-analysis

Compare extracted specs against existing project specs:

- **Conflict Analysis**: Where external specs contradict ours
- **Gap Analysis**: What the external system expects that we don't cover
- **Integration Risk Assessment**: Risk level, mitigation, monitoring
- **Architecture Impact**: Does this require architecture.md updates?
- **Recommended Actions**: Concrete next steps — create changes, tests, updates

### 6. Create shadow specs

```bash
mkdir -p openspec/vendor-specs/<source-name>
# Write extracted BDD specs with [REQ-VENDOR-XXX] IDs
```

### 7. Show summary

```
## Ingestion Complete: <source-name>

### Sources Ingested
| ID | Type | Provider | Confidence |
|----|------|----------|------------|
| VNDR-001 | Swagger 3.0 | PushCorp | High |

### Gaps Found
| Issue | Risk | Recommended Action |
|-------|------|-------------------|
| Missing retry logic | Medium | Create change |

### Output
openspec/vendor-specs/<source-name>/spec.md

Next: Review gap-analysis for recommended actions
```

## Guardrails

- Shadow specs are REFERENCE ONLY — do NOT participate in delta merge
- Always mark extractions with confidence level (High/Med/Low)
- Be explicit about assumptions made during extraction
- For APIs: prioritize request/response contracts over internal details
- Gap analysis MUST produce concrete actionable recommendations
## Help

When invoked with `help` or `--help`:

```
/mvp:ingest — ingest external docs into BDD shadow specs

Usage:
  /mvp:ingest [source-name]

Workflow:
  source-manifest → spec-extraction → gap-analysis → vendor-specs/

Examples:
  /mvp:ingest                              # prompt for sources
  /mvp:ingest push-notification-api        # named source
```
