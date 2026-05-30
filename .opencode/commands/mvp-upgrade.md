---
description: Upgrade project scale (Sketch→Blueprint→Modular→Ecosystem) with verification gate
---

Upgrade the project from one scale level to the next. Scans existing
project state, bootstraps new artifacts, and verifies the transition.

**Input**: Optionally specify target scale after `/mvp:upgrade`.
If omitted, the command detects current scale and recommends next.

---

## Steps

### 1. Detect current scale

```bash
cat openspec/config.yaml
ls openspec/project/profile.md 2>/dev/null && echo "profile: present"
ls openspec/epics/ 2>/dev/null && echo "epics: present"
find openspec/changes/ -maxdepth 1 -mindepth 1 -type d ! -name 'archive' | wc -l
ls openspec/vendor-specs/ 2>/dev/null && echo "vendor-specs: present"
```

Determine: Sketch / Blueprint / Modular / Ecosystem

### 2. Recommend target scale

If user didn't specify a target, recommend the next logical step:

```
Current: Blueprint → Recommended: Modular

Modular adds:
  - epic (large initiative decomposition)
  - vertical-slice (MVP planning with child changes)
  - domain-map (if multi-repo)

Proceed with upgrade?
```

Always include "Other — write your own target" as last option.

### 3. Create the project-upgrade change

```bash
openspec new change upgrade-<from>-to-<to> --schema project-upgrade
```

### 4. Generate upgrade-plan

Use `openspec instructions upgrade-plan --change "upgrade-<from>-to-<to>" --json`.

- **Current Scale Assessment**: What exists today (config, specs, changes)
- **Target Scale**: What we're upgrading to
- **New Artifacts to Create**: Table of artifacts, schemas, auto-derivability
- **Migration Steps**: Ordered checklist of concrete actions:
  - Create new artifacts using their schemas
  - Update config.yaml with new schema defaults
  - Validate all schemas
- **What Stays the Same**: Existing specs, changes, archives unaffected
- **Rollback Plan**: How to undo

### 5. Execute migration

For each step in the plan:
1. Create new artifacts (`openspec new change ... --schema ...`)
2. Update `openspec/config.yaml` defaults
3. Validate: `openspec schema validate <name>` for each new schema

### 6. Generate upgrade-verification

Checklist:
- [ ] All new artifacts exist and are valid
- [ ] `openspec/project/` artifacts are correct
- [ ] Constitution has specific, testable rules
- [ ] Architecture covers all existing spec domains
- [ ] `openspec/config.yaml` updated with correct defaults
- [ ] New schemas validate
- [ ] Existing changes are NOT broken (`openspec list --json`)

**Acceptance Test**: Create a test change. Verify AI:
1. References constitution for constraints
2. References architecture for domain context
3. Does not violate banned patterns

### 7. Show summary

```
## Upgrade Complete: <from> → <to>

### New Artifacts
| Artifact | Schema | Status |
|----------|--------|--------|
| epic.md  | epic   | ✓      |

### Verification
✓ All schemas validate
✓ Test change respects new constitution
✓ Existing changes unaffected

### Next
/mvp:evaluate-scale — confirm scale is now correct
```

## Guardrails

- Upgrade is ADDITIVE — existing specs/changes/archives are NEVER touched
- Verify before completing — if verification fails, don't mark as done
- Always include a rollback plan
- Human review recommended before archiving the upgrade change
- If current scale is unclear, suggest `/mvp:evaluate-scale` first