---
description: Assess project scale (Sketch/Blueprint/Modular/Ecosystem) and recommend schema setup
---

Assess the project's current scale and recommend schema configuration.

**When to use:**
- **New project onboarding** — "What scale should I use?"
- **Mid-project re-evaluation** — "This feels bigger than before. Re-assess?"
- **Scale diagnosis** — "Are we using the right scale?"
- **Scale audit** — "Now that we've shipped, was the choice right?"

Different from `/opsx:explore`:
- `explore` → crystallize a vague idea into a concrete plan
- `evaluate-scale` → diagnose the project itself and recommend schema setup

---

## How It Works

Combines **auto-detected signals** (filesystem scan) with **manual signals**
(user interview, AskUserQuestion tool) to determine the project's scale.

Scale is about **coordination complexity** — not lines of code or team size.

```
              ┌──────────────────────────┐
              │  /mvp:evaluate-scale     │
              └───────────┬──────────────┘
                          │
              ┌───────────▼──────────────┐
              │  Step 1: Auto-Detect     │
              │  Scan project filesystem  │
              └───────────┬──────────────┘
                          │
              ┌───────────▼──────────────┐
              │  Step 2: Ask User         │
              │  Interview for unknowns   │
              └───────────┬──────────────┘
                          │
              ┌───────────▼──────────────┐
              │  Step 3: Apply Tree       │
              │  Map signals → scale      │
              └───────────┬──────────────┘
                          │
              ┌───────────▼──────────────┐
              │  Step 4: Output           │
              │  Recommendation + actions │
              └──────────────────────────┘
```

---

## Step 1: Auto-Detect Project Signals

### 1.1 Scan `openspec/` Structure

```bash
ls openspec/project/ 2>/dev/null && echo "project-profile: present" || echo "project-profile: absent"
ls openspec/epics/ 2>/dev/null && echo "epics dir: present" || echo "epics dir: absent"
ls openspec/vendor-specs/ 2>/dev/null && echo "vendor-specs dir: present" || echo "vendor-specs dir: absent"
ls openspec/schemas/ 2>/dev/null
```

Detect: `has_project_profile`, `has_epics`, `has_vendor_specs`, `custom_schemas`

### 1.2 Count Active Changes

```bash
find openspec/changes/ -maxdepth 1 -mindepth 1 -type d ! -name 'archive' | wc -l
```

Derive: `active_changes_count`

### 1.3 Count Active Epics

```bash
find openspec/epics/ -maxdepth 1 -mindepth 1 -type d | wc -l
```

Derive: `active_epics_count`

### 1.4 Detect Repository Count

```bash
ls .gitmodules 2>/dev/null && echo "polyrepo (git submodules found)"
find . -maxdepth 1 \( -name 'go.mod' -o -name 'Cargo.toml' -o -name 'package.json' -o -name 'setup.py' -o -name 'pom.xml' -o -name 'build.gradle' \) 2>/dev/null
```

Derive: `repo_count` (1 = monorepo, 2+ = polyrepo), `root_module_count`

### 1.5 Estimate Bounded Contexts

```bash
find . -maxdepth 2 -mindepth 2 -type d \( -name 'src' -o -name 'lib' -o -name 'pkg' -o -name 'app' -o -name 'services' -o -name 'internal' \) 2>/dev/null | head -20
ls -d src/*/ 2>/dev/null | wc -l
ls -d pkg/*/ 2>/dev/null | wc -l
ls -d internal/*/ 2>/dev/null | wc -l
ls -d services/*/ 2>/dev/null | wc -l
```

Derive: `bounded_context_estimate`

### 1.6 Detect External API Definitions

```bash
find . -name '*.yaml' -o -name '*.yml' -o -name '*.json' 2>/dev/null | xargs grep -l 'openapi:\|swagger:\|paths:' 2>/dev/null | head -10
```

Derive: `external_api_spec_count`

### 1.7 Read Current Config

```bash
cat openspec/config.yaml 2>/dev/null
```

Derive: `current_schema`, `current_scale_intent`

### 1.8 Check Undocumented Ratio

```bash
spec_count=$(find openspec/specs/ -name '*.md' 2>/dev/null | wc -l)
```

Derive: `undocumented_ratio` (low/medium/high — heuristic)

### Auto-Detect Summary

Present results in table format:

```
## Auto-Detected Signals

| Signal                      | Value                        |
|-----------------------------|------------------------------|
| project-profile exists      | ✓ / ✗                        |
| active epics                | N                            |
| active changes              | N                            |
| repository count            | 1 (monorepo) / N (polyrepo)  |
| bounded contexts (approx)   | N                            |
| external API specs          | N                            |
| vendor-specs dir            | ✓ / ✗                        |
| undocumented code ratio     | low / medium / high          |
| current config schema       | spec-driven / enhanced       |
```

---

## Step 2: Interview User for Manual Signals

Use **AskUserQuestion tool** in a single question (multi-part).

1. How many human contributors? (1 / 2-3 / 4-8 / 8+)
2. How many AI agents or work streams? (1 / 2-3 / 4+)
3. External systems or vendors? (none / 1-2 / 3+)
4. Single team or cross-team? (single / multiple)
5. Current scale setup feel? (works fine / too heavy / too light / unsure)

---

## Step 3: Apply Decision Tree

### Primary Signal: Work Stream Count

```
work_streams = max(active_changes_count,
                   active_epics_count + active_changes_count,
                   human_contributors + ai_agents_in_use)
```

| Work Streams | Scale Candidate |
|--------------|-----------------|
| 1-2          | Sketch          |
| 2-5          | Blueprint       |
| 5-12         | Modular         |
| 12+          | Ecosystem       |

### Modifier Signals (adjust up/down on the scale ladder)

| Condition | Adjustment |
|-----------|------------|
| polyrepo (>= 2 repos) | +1 |
| external vendors >= 3 | +1 |
| multi-team | +1 |
| bounded contexts > 8 | +1 |
| high undocumented ratio | +1 |
| external API specs > 3 | +1 |
| has project-profile | -1 |
| single team AND monorepo | -1 |
| solo dev + 1 AI agent | -1 |

### Final Recommendation

```
Raw work_stream signal:        N → <candidate>
Modifier adjustments:          +N / -N
Modified scale:                <final>

Decision:
  Sketch     → schemas: spec-driven (stock)
                structure: openspec/changes/ only
                
  Blueprint  → schemas: project-profile + spec-driven-enhanced
                structure: + openspec/project/
                
  Modular    → schemas: + epic + vertical-slice
                structure: + openspec/epics/ + domain-map
                
  Ecosystem  → schemas: + external-ingest + code-to-spec
                structure: + openspec/vendor-specs/
```

---

## Step 4: Output Structured Recommendation

Present in this canonical format:

```
## Scale Assessment

**Current setup**: <what exists in openspec/ today>
**Detected scale**: <Sketch / Blueprint / Modular / Ecosystem>
**Confidence**: <High / Medium / Low>

### Signal Summary

| Signal                    | Value    | Weight |
|---------------------------|----------|--------|
| Work streams (detected)   | N        | primary|
| Repository count          | N        | +N/-N  |
| Bounded contexts          | N        | +N/-N  |
| External vendors          | N        | +N/-N  |
| Teams                     | single/multi | +N/-N |
| Undocumented code         | low/med/high | +N/-N |

### Schema Recommendation

| Schema               | Status        |
|----------------------|---------------|
| project-profile      | ✓ installed / ✗ missing |
| epic                 | ✓ installed / ✗ missing |
| vertical-slice       | ✓ installed / ✗ missing |
| spec-driven-enhanced | ✓ installed / ✗ missing |
| external-ingest      | ✓ installed / ✗ missing |
| code-to-spec         | ✓ installed / ✗ missing |
| project-upgrade      | ✓ installed / ✗ missing |

### Next Actions

<If configured correctly:>
  ✓ Your project is properly configured for <scale> scale.

<If scale mismatch or missing schemas:>
  **Detected <detected> but configured for <current>.**
  → `/opsx:explore` to discuss the recommendation
  → `openspec new change upgrade-<from>-to-<to> --schema project-upgrade`
  → Or manually add missing schemas + update config.yaml

<If signals conflict:>
  **Signals mixed.** Confidence Low.
  → Start lighter, upgrade when needed
  → Run `/opsx:explore` to discuss
  → Try Blueprint as safe default
```

### UX Rule

Last option after recommendation must be: "Other — discuss further or override"

---

## Guardrails

- **Read-only** — Never create, edit, or delete files
- **Always ask user interview** — Auto-detection alone is insufficient
- **Recommendation is advisory** — User may override or defer
- **Don't default to Ecosystem** — Only if clear polyrepo + multi-vendor + multi-team
- **Don't confuse code size with scale** — Large CRUD = still Sketch/Blueprint
- **Explain the "why"** — Always show signal → scale mapping
- **Suggest `/opsx:explore` as follow-up** — If user wants to discuss before acting
- **Handle "this feels wrong"** — Discuss and adjust signals