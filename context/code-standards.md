# Code Standards

## General

- Keep modules small and single-purpose.
- Fix root causes — do not layer workarounds.
- Do not mix unrelated concerns in one component or route.
- Respect the system boundaries defined in `architecture-context.md`.

## TypeScript

- Strict mode is required throughout the project.
- Avoid `any`; use explicit interfaces or narrowly scoped types.
- Validate unknown external input at system boundaries before trusting it.
- Use `interface` for object contracts.

## Next.js

- Default to React Server Components.
- Add `"use client"` only when the component needs browser interactivity, hooks, or real-time state.
- Keep route handlers focused on a single responsibility.
- Long-running work belongs in background tasks, not in request handlers.

## Styling

- Use CSS custom property tokens defined in `globals.css` — no raw Tailwind color classes like `zinc-*` or hardcoded hex values.
- Reference tokens through their Tailwind utility names: `bg-base`, `text-copy-primary`, `border-surface-border`, `text-brand`, etc.
- Maintain the border radius scale: `rounded-xl` for small elements, `rounded-2xl` for cards, `rounded-3xl` for modals.

## Mobile Browser Implementation

- Follow the project-wide [mobile browser requirements](ui-context.md#mobile-browser-requirements) for every new or changed UI, including admin and board surfaces.
- Use responsive layouts that reflow at narrow widths. Avoid unqualified multi-column forms, page-wide minimum widths, and fixed overlay dimensions that make phone controls unreachable.
- Essential actions need touch-accessible controls; do not rely exclusively on hover, double-click, dragging, or a keyboard shortcut. Adapt to input capability as well as viewport width.
- Handle safe areas, dynamic viewport height, scrolling, and the on-screen keyboard at the app/component boundary. Do not hide overflow merely to conceal clipped content, and do not disable browser zoom.
- Reuse existing components and server logic across screen sizes. Apply responsive behavior through app-level composition and styles; the generated `components/ui/*` protection still applies.
- Verify changed flows using the [mobile browser workflow](ai-workflow-rules.md#mobile-browser-verification), and record untested behavior accurately.

## API Routes

- Validate and parse request input before any logic runs.
- Enforce auth and project ownership checks before any mutation.
- Return consistent, predictable response shapes.
- Keep route handlers thin — push complexity into shared modules or background tasks.

## Data and Storage

- Member, project, task, financial, penalty, calendar, meeting, and idea records belong in PostgreSQL via Prisma.
- Collaborative board snapshots (roadmap and ideas board), receipts, and document attachments belong in Vercel Blob; Prisma stores only the blob URL reference.
- Do not store large generated or uploaded content directly in the database.
- Financial transactions and penalties are corrected via new adjustment records, not edits to settled records — treat ownership and role checks as verified before any mutation.

## File Organization

- `lib/` — shared infrastructure: Prisma client, auth helpers, role/permission checks, Liveblocks room helpers, utilities.
- `trigger/` — all durable background jobs (reminders, notifications, recurring checks).
- `components/` — UI composition only; no business logic.
- `app/api/` — route handlers for auth, triggering, and persistence, organized by domain.
- Name files after the responsibility they contain, not the technology.

## Interaction performance

- Bound DOM output for growing tables/lists. Keep selection, filtering and exports explicit about whether they span the current page or all matching records.
- Preserve stable derived-data dependencies across unrelated dialog/tab state changes; avoid reparsing unchanged Markdown or rebuilding unchanged boards.
- Large client exports must yield during projection/encoding and show progress/errors. Debouncing delays work but does not make synchronous work interruptible.
- Validate interaction refactors with representative workloads and behavior checks. Record source-level risks separately from measured browser durations; fixture timing is not field INP. See the [interaction audit](current-issues/current-issues-interaction-performance.md).
