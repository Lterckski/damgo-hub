# Development Workflow

## Approach

Build this project incrementally using a spec-driven workflow. Context files define what to build, how to build it, and what the current state of progress is. Always implement against these specs — do not infer or invent behavior from scratch.

## Scoping Rules

- Work on one feature unit or subsystem at a time.
- Prefer small, verifiable increments over large speculative changes.
- Do not combine unrelated system boundaries in a single implementation step.

## When To Split Work

Split an implementation step if it combines:

- UI changes and background task changes
- Real-time canvas state and database persistence
- Multiple unrelated API routes
- Behavior that is not clearly defined in the context files

If a change cannot be verified end to end quickly, the scope is too broad — split it.

## Handling Missing Requirements

- Do not invent product behavior that is not defined in the context files.
- If a requirement is ambiguous, resolve it in the relevant context file before implementing.
- If a requirement is missing, add it as an open question in `progress-tracker.md` before continuing.

## Protected Foundation Components

Do not modify generated third-party foundation components unless explicitly instructed.

This includes:

- `components/ui/*` (shadcn/ui components)
- third-party library internals

These should remain default and reusable.

Project-specific styling, layout changes, and feature logic must be implemented in app-level components instead of modifying foundation components.

Only modify these files when a task explicitly requires it.

## Keeping Docs In Sync

Update the relevant context file whenever implementation changes:

- System architecture or boundaries
- Storage model decisions
- Code conventions or standards
- Feature scope

Progress state must reflect the actual state of the implementation, not the intended state.

## Mobile Browser Verification

Mobile-browser friendliness is a project-wide acceptance requirement, not a later enhancement. Apply it to existing-feature repairs and new work, including admin and collaborative board flows.

1. Review the affected flow at representative phone widths (320, 375/390, and 430 CSS pixels), tablet width, and desktop width. Check portrait and landscape, long content, empty/error states, and menu/dialog transitions.
2. Verify touch navigation, field entry, file selection where relevant, on-screen keyboard behavior, safe-area spacing, and reachable submit/dismiss controls. For boards, include pan/zoom, selection, editing, and available connection actions. Retain desktop mouse and keyboard behavior.
3. Validate relevant authenticated member/admin flows in iOS Safari and Android Chrome. Responsive desktop emulation is useful for layout checks but does not establish device keyboard, browser chrome, upload, or touch behavior by itself.
4. Record tested browser/device or emulation environment, checked flows, and remaining gaps in `progress-tracker.md`. If browser/device testing is unavailable, state that limitation and leave the affected mobile verification pending; passing a build or unit tests does not establish mobile readiness. Continue independent implementation and checks without adding an approval gate.

Use [mobile browser issues](current-issues/current-issues-mobile-browser.md) for the existing backlog. Documentation-only changes require link/diff checks, not an application build or a claim of device testing.

## Before Moving To The Next Unit

1. The current unit works end to end within its defined scope.
2. No invariant defined in `architecture-context.md` was violated.
3. `progress-tracker.md` reflects the completed work.
4. Changed UI satisfies the mobile requirements, with verification evidence recorded; unresolved mobile defects or unavailable device checks remain explicitly pending.

## Current performance observation hold

The user requested one week of real Core Web Vitals data before further optimization. Add/verify the RUM instrumentation, deploy through the normal workflow, and record the actual collection start. Do not refactor interaction behavior further during the observation week unless the user changes this instruction. Earlier local improvements remain in place; do not silently revert or deploy them as part of monitoring. Review sample counts, release boundaries and device coverage alongside p75. [Observation runbook](current-issues/current-issues-real-user-monitoring.md).
