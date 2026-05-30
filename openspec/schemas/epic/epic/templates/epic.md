# Epic: <!-- Epic Title -->

<!-- Created: YYYY-MM-DD
     Directory: openspec/epics/YYYY-MM-<slug>/epic.md

     ## Lifecycle

     - Active: slices are being created or implemented
     - Dormant (◌): no slice activity for 60 days — signal to revisit
     - Completed (✓): all slices archived
     - Epics are NEVER deleted — completed and dormant epics remain as
       historical records. The profile.md dashboard auto-marks dormancy.
     - When dormant, team should decide: reactivate or formally close.

     ## Fit-Level Decision (how to know if work belongs here)

     Before creating this epic, verify that the work:
     1. Spans multiple independent testable streams (vertical slices)
     2. Cannot be achieved in a single vertical-slice or simple-change
     3. Does NOT change project identity or governance (that's project-wide)

     If the scope is unclear, use /opsx:explore first.
     Explorer concludes with: project-wide | new-epic | vertical-slice | simple-change

     ## TODO.md Triage

     Emergent ideas for future slices go in the "Future Ideas" section below
     and in openspec/epics/<slug>/TODO.md. AI periodically scans these and
     surfaces: "You have N items. Promote to a slice or dismiss?"
     Items >90 days with no activity are flagged ◌ dormant. -->

## Vision

<!-- 2-3 sentences on the business goal. What user value does this deliver? -->

## Vertical Slices

<!-- Each slice is independently testable and shippable.
     Types: Feature (user-facing), Infrastructure (build/devops),
     Coordination (integration).

     Status: [ ] Planned / [~] In Progress / [x] Done
     Derived from scanning openspec/changes/. -->

### MVP Slice N: <!-- Slice Name -->

- **Type**: Feature / Infrastructure / Coordination
- **Business Value**: <!-- What this slice enables -->
- **Acceptance Criteria (DoD)**: <!-- Observable, testable conditions -->
- **Affected Domains**: <!-- Bounded contexts touched -->
- **Implementation Changes**:
  - `change: <name>` → repo: <repo>
- **Status**: [ ] Planned

## Slice Dependency Graph

<!-- Mermaid or ASCII diagram. -->

## Global Acceptance Criteria

<!-- Epic-level DoD spanning all slices. -->

## Future Ideas

<!-- Emergent ideas for future slices. Feeds into TODO.md. -->
- [ ] <!-- idea -->
