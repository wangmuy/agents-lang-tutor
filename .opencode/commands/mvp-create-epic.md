---
description: Create an epic to track a large initiative decomposed into vertical slices
---

Create an epic to decompose a large initiative into independently
testable vertical slices. Epics live in `openspec/epics/YYYY-MM-<slug>/`
and are tracking artifacts — never archived.

**Input**: Optionally specify an epic name or description after `/mvp:create-epic`.

---

## Steps

### 1. Gather epic vision

Use the **AskUserQuestion tool**:

1. What's the epic about? (2-3 sentence business goal)
2. How many slices do you anticipate? Names or behaviors?
3. Any cross-cutting concerns (auth, performance, compliance)?

From the answers, derive a kebab-case slug.

### 2. Create epic directory

Epics use the naming convention: `openspec/epics/YYYY-MM-<slug>/`

```bash
DATE=$(date +%Y-%m)
mkdir -p openspec/epics/$DATE-<slug>
```

### 3. Generate epic.md

Use the epic template to create `openspec/epics/$DATE-<slug>/epic.md`:

- **Vision**: 2-3 sentences on the business goal
- **Vertical Slices**: Each MUST be independently testable and shippable.
  - Feature slices: user-facing behavior
  - Infrastructure slices: build/devops behavior
  - Coordination slices: integration behavior
  - For each: Business Value, Acceptance Criteria (DoD), Affected Domains,
    Implementation Changes (planned child changes), Status
  - CORRECT: "User can enroll in 2FA and verify their authenticator"
  - WRONG: "Backend 2FA API" or "Frontend 2FA enrollment UI"

- **Slice Dependency Graph**: Mermaid or ASCII diagram
- **Global Acceptance Criteria**: Epic-level DoD spanning all slices

### 4. Create TODO.md

```bash
cat > openspec/epics/$DATE-<slug>/TODO.md << 'EOF'
# TODO — Future Slices & Ideas
- [ ] 
EOF
```

### 5. Show summary

```
## Epic Created: <slug>

openspec/epics/YYYY-MM-<slug>/
├── epic.md    — Vision + vertical slice decomposition
└── TODO.md    — Future slice ideas

Next: /mvp:create-slice <slice-name> for each slice
```

## Guardrails

- Choose the current month for the date prefix (YYYY-MM)
- Slices MUST be business-behavior MVPs, not tech-stack assignments
- Each slice must have a clear, testable DoD
- Epics are planning artifacts — they are NEVER archived
- Epic "done" = all slices complete