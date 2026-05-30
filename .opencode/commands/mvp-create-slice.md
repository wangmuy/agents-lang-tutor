---
description: Create a vertical-slice change with auto-scaffolded child changes
---

Create a vertical-slice change that decomposes into multiple spec-driven
implementation changes. Generates slice-proposal.md, change-manifest.md,
and auto-scaffolds each child change.

**Input**: Optionally specify a slice name (kebab-case) or description after
`/mvp:create-slice`. If omitted, the AI will ask.

---

## Steps

### 1. Check existing epics

```bash
ls openspec/epics/ 2>/dev/null && echo "Epics found" || echo "No epics"
```

If epics exist, ask the user if this slice belongs to an existing epic.
If yes, read the epic's `epic.md` for context and select which slice
on the epic's plan this corresponds to.

### 2. Gather slice scope

Use the **AskUserQuestion tool** (single multi-part question):

1. What's a one-sentence name or user story for this slice?
2. Slice type: Feature / Infrastructure / Coordination?
3. Which domains/bounded contexts does this touch?

From the answers, derive a kebab-case name.

### 3. Create the vertical-slice change

```bash
openspec new change "<name>" --schema vertical-slice
```

This scaffolds `openspec/changes/<name>/` with `.openspec.yaml`.

### 4. Create slice-proposal

Use `openspec instructions slice-proposal --change "<name>" --json` to get
the template + instruction. Populate:
- **Parent Epic**: Link or "Standalone vertical slice"
- **Slice Type**: Feature / Infrastructure / Coordination
- **User Story**: One sentence
- **In Scope / Out of Scope**: Concrete behaviors, with explicit exclusions
- **Acceptance Criteria**: E2E Given-When-Then scenarios
- **Affected Domains**: Which bounded contexts from architecture.md

### 5. Create change-manifest — decompose into child changes

User the AskUserQuestion tool to decompose the slice:

"To implement this slice, how should we break it down into changes?
Each change is a spec-driven implementation unit owned by one repo.
Examples: be-auth-api, fe-login-ui, db-migrations"

Fill in the change-manifest with:
- **Change Assignments**: name, repository, scope, responsibility, depends-on
- **Shared Contract Stubs**: API contracts that enable parallel development.
  Must be precise — frontend should build complete UI mocks without backend.
- **Integration Test Plan**: E2E scenarios verifying all changes together.

Write to `slice-proposal.md` first (requires: []), then `change-manifest.md`
(requires: [slice-proposal]).

Use `openspec instructions <artifact> --change "<name>" --json` for each.

### 6. Auto-scaffold child changes

For each change assignment in the manifest:

```bash
openspec new change "<child-name>" --schema spec-driven-enhanced
```

Then write a minimal `proposal.md` for each child change:
```
## Parent Context
- Slice: openspec/changes/<slice-name>/
- Responsibility: <from manifest>
```

Finally, update the change-manifest to mark each change as `[~] Created`.

### 7. Show summary

```
## Slice Created: <slice-name>

### Child Changes Scaffolded
| Change | Repo | Scope | Status |
|--------|------|-------|--------|
| <name> | <repo> | <scope> | Created |

### Shared Contracts
| Name | Protocol | Spec |
|------|----------|------|
| <name> | POST /api/... | {...} |

### Next step
/mvp:apply-slice <slice-name>  — to implement all child changes
```

## Guardrails

- Always ask about parent epic before creating — don't assume standalone
- Contract stubs must be PRECISE — endpoint, method, request body, response body, error codes
- Child change names must be unique kebab-case
- Each child change gets `spec-driven-enhanced` schema (for traceability + blast radius)
- Update change-manifest statuses as child changes are created