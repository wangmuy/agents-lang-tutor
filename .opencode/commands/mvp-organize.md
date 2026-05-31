---
description: Execute structural reorganization — merge standalone items into existing structures or create new parent containers
---

Execute structural reorganization based on audit results. Merge standalone
changes into existing slices, standalone slices into existing epics, or
create new containers from clustered items.

**Input**: Optionally specify actions:
- `/mvp:organize` — run scan + present all recommendations
- `/mvp:organize --merge change <name> into slice <slice>` — specific merge
- `/mvp:organize --merge slice <name> into epic <epic>` — specific merge
- `/mvp:organize --auto` — auto-apply HIGH confidence, ask for MEDIUM

---

## Steps

### 1. Run scan (or use cached audit)

If no specific target provided, run the same scan as `/mvp:audit`.

### 2. Present action items

For each recommendation, present context and ask for confirmation:

```
## Organize

### 1. Merge change → existing slice (HIGH confidence)
Change: be-pay-report
Target: slice payment-integration (3 existing children)
Affinity: [domain:pay], [blast_radius:src/payments]
Action: Append to change-manifest.md, update proposal parent ref
Proceed? [Y/n/skip all HIGH]

### 2. Merge slice → existing epic (HIGH confidence)
Slice: slice-2fa
Target: epic auth-identity (2 existing slices)
Affinity: [domain:auth], [sequential:dependency]
Action: Append to epic.md slice list, update dependency graph
Proceed? [Y/n/skip all HIGH]

### 3. Create slice from cluster (MEDIUM confidence)
Cluster: be-sub-api + fe-sub-ui (2 standalone changes)
Affinity: [domain:sub], [blast_radius:src/subscription]
Action: /mvp:create-slice subscription-management
Proceed? [y/N/skip]

No more actions.
```

### 3. Execute merge — change into existing slice

1. Read `openspec/changes/<slice>/change-manifest.md`
2. Append change assignment entry:
   ```markdown
   ### Change: <change-name>
   - **Repository**: <detected from change>
   - **Scope**: <detected from change>
   - **Responsibility**: <from proposal>
   - **Depends On**: none
   - **Status**: [~] Created
   ```
3. Update the merged change's `proposal.md`:
   ```markdown
   ## Parent Context
   - Slice: openspec/changes/<slice>/
   ```
4. Report: "✓ Merged <change> into <slice>"

### 4. Execute merge — slice into existing epic

1. Read `openspec/epics/<epic>/epic.md`
2. Append vertical slice entry under the correct slice type heading
3. Update the dependency graph (Mermaid or ASCII)
4. Update the merged slice's `slice-proposal.md`:
   ```markdown
   ## Parent Epic
   openspec/epics/<epic>/epic.md
   ```
5. Report: "✓ Merged <slice> into <epic>"

### 5. Execute create — new container from cluster

For change clusters:
- Invoke `/mvp:create-slice <name>` with pre-populated context:
  - scope from aggregated change data
  - manifest from cluster members
  - contract stubs from shared contracts

For slice clusters:
- Invoke `/mvp:create-epic <name>` with pre-populated slice list

### 6. Execute abandon — mark item as abandoned

When audit detects dormant epics (>60 days) or stale changes (>90 days),
or when the user explicitly asks to abandon an item:

1. Ask for reason:
   - [ ] Scope changed, no longer needed (abandoned)
   - [ ] Replaced by <other-item> (deprecated)
   - [ ] Technical dead-end (withdrawn)
   - [ ] Other: ___

2. Move the item to the abandoned/ directory:
   ```bash
   # For epic
   mv openspec/epics/<epic> openspec/epics/abandoned/<epic>
   
   # For change/slice
   mv openspec/changes/<change> openspec/changes/abandoned/<change>
   ```

3. Update front matter:
   ```yaml
   ---
   status: abandoned    # or: deprecated
   abandoned:
     reason: "Scope changed — replaced by new-approach"
     date: "2026-05-31"
     replaced_by: "new-approach"   # if applicable
     impact: ["slice-login now orphaned", "reassign slice-2fa"]
   ---
   ```

4. Check for orphaned references — items that still point to the abandoned item. If found, offer to reassign:
   ```
   slice-2fa references abandoned epic auth-system.
   Reassign?
     → epic security-hardening (domain:auth match)
     → Abandon slice-2fa too
     → Keep reference (broken)
   ```

5. Report: "✓ Abandoned <item> → openspec/<path>/abandoned/<item>"

### 7. Show completion summary

```
## Organize Complete

✓ Merged be-pay-report into slice payment-integration
✓ Merged slice-2fa into epic auth-identity
✓ Created slice subscription-management from 2 changes
✕ Abandoned epic 2025-01-auth (scope changed, 120 days dormant)
✕ Deprecated slice-old-login (replaced by slice-auth)

Remaining:
• be-hotfix-timeout — truly standalone (no action needed)
```

### 8. Unarchive — restore archived item for modification

When a bug is found in an archived change or slice, unarchive it:

1. Read the item from archive/ directory
2. Move back to active:
   ```bash
   # For change/slice
   mv openspec/changes/archive/<name> openspec/changes/<name>
   
   # For epic
   mv openspec/epics/archive/<epic> openspec/epics/<epic>
   ```
3. Update front matter status → `active`
4. Report: "✓ Unarchived <item>. Fix and re-archive when done via /opsx:archive."

For archived slices with child changes: unarchive the slice AND all its
child changes together. List them all before proceeding.

### 9. Reactivate — restore abandoned item

When an abandoned item is needed again:

1. Move from abandoned/ back to active:
   ```bash
   # For epic
   mv openspec/epics/abandoned/<epic> openspec/epics/<epic>
   
   # For change/slice
   mv openspec/changes/abandoned/<change> openspec/changes/<change>
   ```
2. Update front matter:
   ```yaml
   status: active
   abandoned:
     reason: ""
     date: ""
     replaced_by: ""
     impact: []
   ```
3. Audit for reference conflicts — items that reference the reactivated item
   as "abandoned" or were reassigned after abandonment.
4. Report: "✓ Reactivated <item>. Run /mvp:audit to verify no conflicts."

### 10. Help

When invoked with `help` or `--help`:

```
/mvp:organize — execute structural reorganization

Actions:
  Without args         Run full scan + present all recommendations
  --merge change <c> into slice <s>
                       Merge a standalone change into an existing slice
  --merge slice <s> into epic <e>
                       Merge a standalone slice into an existing epic
  --create-slice <name>
                       Create new slice from clustered standalone changes
  --create-epic <name>
                       Create new epic from clustered standalone slices
  --abandon <item>
                       Mark item as abandoned (mv to abandoned/ + update FM)
  --unarchive <item>
                       Restore archived item for modification
  --reactivate <item>
                       Restore abandoned item back to active
  --auto                Auto-apply HIGH confidence actions, ask for MEDIUM

Examples:
  /mvp:organize                          # full interactive session
  /mvp:organize --abandon 2025-01-auth   # abandon specific epic
  /mvp:organize --unarchive be-pay-api   # restore for bug fix
  /mvp:organize --reactivate slice-2fa   # bring back abandoned slice
  /mvp:organize --auto                   # auto-fix safe items
```

## Guardrails

- Always ask before modifying files — no silent edits
- HIGH confidence merge: pre-select Y, user can skip
- MEDIUM confidence: pre-select N, user must opt in
- LOW confidence: don't even offer as action, just note in audit
- Never overwrite existing structure — append, don't replace
- Abandon makes items read-only — reactivate is possible if needed
- Unarchive is for bug fixes only — re-archive when done
- Check for orphan references before abandoning — don't break active links