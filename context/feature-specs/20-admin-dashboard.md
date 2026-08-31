# Admin Side

## Goal

Build the Admin-only oversight area. This is a thin aggregation layer over data that already exists from earlier units — it adds no new domain models, just Admin-scoped views and route protection.

## Access

Create `app/(app)/admin/layout.tsx` as a server component.

- check access via `isCurrentMemberAdmin()` (`lib/current-member.ts`) — the Clerk `org:admin` role, not any field on `Member`
- non-Admins are redirected to `/dashboard`
- this layout wraps every route under `/admin/*`

## Pages

Create `app/(app)/admin/page.tsx` — overview.

- summary cards: total members, open penalties, pending transactions, active project proposals
- each card links to the relevant detail tab below

Create `app/(app)/admin/members/page.tsx` — deep link into the existing Member Tracker (`05-member-directory.md`); reuse that page's table component rather than rebuilding it.

Create `app/(app)/admin/finance/page.tsx` — all transactions with `PENDING` status surfaced first, reusing the table and approve/reject actions from `07-financial-tracker.md`.

Create `app/(app)/admin/penalties/page.tsx` — deep link into the Admin view already built in `18-penalty-tracker.md`.

Create `app/(app)/admin/projects/page.tsx` — all project proposals regardless of ownership, with status filters, reusing card components from `11-project-proposals.md`.

## Implementation

Favor composition over duplication: every page here should reuse the components and API routes built in the earlier feature units, scoped to "show everything" instead of "show mine," rather than introducing parallel admin-only components.

## Check When Done

- non-Admins cannot reach any `/admin/*` route (server-side redirect, not just a hidden nav link)
- overview cards show real counts
- each admin page reuses existing feature components instead of duplicating them
- `npm run build` passes
