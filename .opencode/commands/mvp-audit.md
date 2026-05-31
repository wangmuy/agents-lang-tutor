---
description: Scan project structure for standalone items and propose hierarchical reorganization (merge or create)
---

Scan the project for structural drift — standalone changes, standalone
slices, and missing project foundation. Compute affinity between items
and existing structures, then recommend merge or create actions.

Read-only. Never modifies files.

**Input**: Optionally target a specific layer: `/mvp:audit structure`,
`/mvp:audit changes`, `/mvp:audit slices`.

---

**Skills**: Check `openspec/skills-profile.yaml` for suggested community
skills under key `mvp-audit`. Offer to load them — user decides.
## Steps

### 1. Scan project state

```bash
# List active changes (exclude archive + abandoned)
find openspec/changes/ -maxdepth 1 -mindepth 1 -type d ! -name 'archive' ! -name 'abandoned' | while read d; do echo $(basename $d); done

# Also list archived + abandoned — they are potential merge/reactivate targets
echo "=== Archived ===" && ls openspec/changes/archive/ 2>/dev/null
echo "=== Abandoned ===" && ls openspec/changes/abandoned/ 2>/dev/null
echo "=== Archived epics ===" && ls openspec/epics/archive/ 2>/dev/null
echo "=== Abandoned epics ===" && ls openspec/epics/abandoned/ 2>/dev/null

# List active epics with front matter status
for epic in openspec/epics/*/; do
  [ "$(basename $epic)" = "abandoned" ] && continue
  [ "$(basename $epic)" = "archive" ] && continue
  [ -d "$epic" ] || continue
  status=$(head -10 "$epic/epic.md" | grep "status:" | sed 's/status: //' | tr -d ' ')
  echo "$(basename $epic): $status"
done
```

### 2. Classify each change

For each active, non-archived, non-abandoned change:
```bash
# Check if referenced in any slice change-manifest (active + archived)
grep -r "$change_name" openspec/changes/*/change-manifest.md 2>/dev/null
grep -r "$change_name" openspec/changes/archive/*/change-manifest.md 2>/dev/null
```

If found in a change-manifest → **owned** (has parent slice).
If NOT found → **standalone** (potential drift).

### 3. Classify each slice + detect orphans

For each vertical-slice change:
```bash
# Check if referenced in any epic.md (active + archived)
grep -r "$slice_name" openspec/epics/*/epic.md 2>/dev/null
grep -r "$slice_name" openspec/epics/archive/*/epic.md 2>/dev/null
```

If found in an epic.md → **owned**.
If NOT found → **standalone slice**.

Then check for orphan references — abandoned items that active items still point to:
```bash
for item in openspec/epics/abandoned/*/ openspec/changes/abandoned/*/; do
  [ -d "$item" ] || continue
  name=$(basename "$item")
  grep -r "$name" openspec/changes/*/slice-proposal.md 2>/dev/null && echo "ORPHAN: $name still referenced from active"
  grep -r "$name" openspec/changes/*/proposal.md 2>/dev/null && echo "ORPHAN: $name still referenced from active"
done
```

### 4. Compute affinity — merge candidates (active + archived + abandoned)

For each standalone item, compute affinity with ALL existing structures:

**Change → Slice** affinity — check ACTIVE slices first, then ARCHIVED, then ABANDONED:

| Target State | If matched | Recommendation |
|-------------|-----------|----------------|
| Active slice | HIGH affinity | merge (standard) |
| Archived slice | HIGH affinity | unarchive + merge |
| Abandoned slice | HIGH affinity | reactivate + merge |
| No match | — | proceed to clustering |

Affinity signals (same for all target states):
| Signal | Detection | Weight |
|--------|-----------|--------|
| Domain prefix | Same `<domain>-` prefix | STRONG |
| Blast radius path | Same `src/<path>/` | STRONG |
| Shared contract | Same API endpoint | MEDIUM |
| Parent context | Proposal mentions same epic/slice | STRONG |

**Slice → Epic** affinity — check ACTIVE epics first, then ARCHIVED, then ABANDONED:

| Target State | If matched | Recommendation |
|-------------|-----------|----------------|
| Active epic | HIGH affinity | merge (standard) |
| Archived epic | HIGH affinity | unarchive epic + merge |
| Abandoned epic | HIGH affinity | reactivate epic + merge |
| No match | — | proceed to clustering |

# Check project foundation
ls openspec/project/profile.md 2>/dev/null && echo "profile: present" || echo "profile: absent"
ls openspec/project/constitution.md 2>/dev/null && echo "constitution: present" || echo "constitution: absent"
```

### 2. Classify each change

For each non-archive, non-abandoned change:
```bash
# Check if referenced in any slice change-manifest
grep -r "$change_name" openspec/changes/*/change-manifest.md 2>/dev/null
```

If found in a change-manifest → **owned** (has parent slice).
If NOT found → **standalone** (potential drift).

### 3. Classify each slice + detect orphans

For each vertical-slice change:
```bash
# Check if referenced in any epic.md (active epics only)
grep -r "$slice_name" openspec/epics/*/epic.md 2>/dev/null
```

If found in an epic.md → **owned**.
If NOT found → **standalone slice**.

Then check for orphan references — abandoned items that active items still point to:
```bash
# Check if any active slice or change references an abandoned epic
for epic in openspec/epics/abandoned/*/; do
  [ -d "$epic" ] || continue
  name=$(basename $epic)
  grep -r "$name" openspec/changes/*/slice-proposal.md 2>/dev/null && echo "ORPHAN: $name still referenced"
done
```

### 4. Compute affinity — merge candidates

For each standalone item, compute affinity with EXISTING structures first:

**Change → Existing Slice** affinity signals:
- Domain prefix match: same `<domain>-` prefix in change name vs slice child change names
- Blast radius overlap: same `src/<path>/` patterns
- Contract sharing: references same API endpoints
- Parent context: proposal mentions same epic/slice slug

**Slice → Existing Epic** affinity signals:
- Affected domains: same bounded contexts listed
- Naming family: same prefix pattern
- Existing reference: slice proposal mentions this epic

Confidence rating: HIGH (2+ STRONG signals) / MEDIUM (1 STRONG + others) / LOW (only weak)

### 5. Compute affinity — create candidates

For standalone items with LOW/no match to existing structures,
cluster them with other standalone items:

- Group changes by domain prefix + blast radius overlap
- Group slices by affected domains + naming family

A cluster with 2+ items → CREATE candidate.

### 6. Check project foundation

- `standalone_count > 5` AND no profile → suggest init-profile
- `has_changes` AND no constitution → suggest init-profile
- Architecture doesn't list all active domains → suggest update

### 7. Output structured report

```
## Structure Audit

### Layer 0 — Project Foundation
✓ profile.md   ✓ constitution.md   ✓ architecture.md
No issues.

### Layer 1 — Changes
Total: 8 | Owned: 5 | Standalone: 3

Merge candidates:
• be-pay-report → slice payment-integration (HIGH: [domain:pay], [blast_radius:src/payments])
  → /mvp:organize --merge change be-pay-report into slice payment-integration

Create candidates:
• [NO clusters found among remaining standalone changes]

Truly standalone:
• be-hotfix-timeout (no affinity to any structure)

### Layer 2 — Slices
Total: 3 | Owned: 1 | Standalone: 2

Merge candidates:
• slice-2fa → epic auth-identity (HIGH: [domain:auth], [sequential:depends on slice-login])
  → /mvp:organize --merge slice slice-2fa into epic auth-identity

Create candidates:
• [NO clusters — only 1 remaining standalone slice]

### Summary
┌──────────────────────┬──────────┬──────────────────────┐
│ Layer                │ Current  │ Suggested            │
├──────────────────────┼──────────┼──────────────────────┤
│ Foundation           │ ✓        │ —                    │
│ Changes              │ 3 standalone│ 1 merge, 2 keep   │
│ Slices               │ 2 standalone│ 1 merge, 1 keep   │
└──────────────────────┴──────────┴──────────────────────┘

Next: /mvp:organize to apply recommendations
```

## Guardrails

- Read-only — never modify files
- Always check merge BEFORE create (existing structures take priority)
- Confidence matters: HIGH → recommend, MEDIUM → suggest, LOW → note only
- Truly standalone items are normal — not every change needs a parent
- Target a specific layer with `/mvp:audit <layer>` if you only want partial results
## Help

When invoked with `help` or `--help`:

```
/mvp:audit — scan project structure for standalone items

Usage:
  /mvp:audit [target]

Targets:
  all            Full scan (default) — all layers
  structure      Project foundation only (profile, constitution, architecture)
  changes         Standalone changes → slice merge/create candidates
  slices          Standalone slices → epic merge/create candidates

The audit considers ALL items for merge targets:
  • active — standard merge
  • archived — suggests unarchive + merge (reopen)
  • abandoned — suggests reactivate + merge (revive)

Examples:
  /mvp:audit                        # full scan
  /mvp:audit changes                # only change→slice affinity
  /mvp:audit slices                 # only slice→epic affinity

Next: /mvp:organize to apply recommendations
```
