# Architecture Context

## Stack

| Layer                | Technology              | Role                                                                    |
| --------------------- | ------------------------ | ------------------------------------------------------------------------ |
| Framework             | Next.js 16 + TypeScript  | Full-stack app with server/client boundaries                            |
| UI                    | Tailwind + shadcn/ui     | Component composition and styling                                       |
| Auth                  | Clerk (B2B Organizations) | Member identity, org-level admin/member roles, and route protection    |
| Database              | Prisma + PostgreSQL      | Relational data: members, projects, tasks, finances, penalties, records |
| Real-time collaboration | Liveblocks + React Flow | Live collaborative boards: project roadmaps and ideas board              |
| Background jobs       | Trigger.dev              | Durable, scheduled work: reminders, notifications, recurring checks      |
| Transactional email   | Resend                   | Meeting invitations, changes, cancellations, and scheduled reminders      |
| Artifact storage      | Vercel Blob              | Board snapshots, receipts, and uploaded document attachments             |

## System Boundaries

- `app/api` — Authenticated request handlers, organized by domain (`projects`, `tasks`, `finance`, `calendar`, `meetings`, `penalties`, `members`, `ideas`, `admin`, `agenda`): input validation, role/ownership checks, persistence, and scheduling background jobs.
- `trigger` — Durable scheduled jobs: meeting and calendar reminders, penalty due-date checks, recurring financial summaries.
- `lib` — Shared infrastructure: Prisma client, Clerk auth helpers, role/permission checks, Liveblocks room helpers, and utilities.
- `components` — UI composition: dashboard widgets, collaborative boards, tables (finance ledger, tasks, penalties), calendar views, meeting/agenda views, admin panels.
- `prisma` — Database schema and generated client output.

## Storage Model

- **Database**: all relational metadata and records of truth — members, roles, project proposals, milestones, task assignments, financial transactions, penalties, calendar events, meetings, agenda items, and ideas.
- **Vercel Blob**: generated or uploaded artifacts too large or unstructured for relational storage — collaborative board snapshots (`boards/{roomId}.json`), financial receipts (`receipts/{transactionId}/{fileId}`), and documentation attachments (`docs/{docId}/{fileId}`).
- The blob URL is stored on the owning database record (e.g. `boardSnapshotPath`, `receiptPath`, `attachmentPath`) as the reference to the artifact — the database never stores blob content directly.

## Auth and Roles Model

Damgo Hub is a single organization (per the out-of-scope note below) run entirely as one Clerk B2B Organization. There is no custom-built permission system — Clerk Organizations is the source of truth for who can act as Admin.

**Unit 23 implemented boundary:** `lib/hub/context.ts` binds the singleton deployment to the seeded leader's verified Clerk organization (`HubWorkspace`), then validates the calling user's current membership and role with a targeted live Clerk lookup on every request; a stale session claim cannot preserve access after removal or demotion. It rejects a different active org. Full roster reads remain uncached across requests and reconcile `HubMembership` only for features that need organization-wide member options; ordinary viewer/header/API guards never download or rewrite the full roster. Legacy domain tables/settings/rooms remain single-org; the switcher does not enable multi-tenancy. Clerk remains the membership authority. The shared `user`/`org`/`project`/`role` policy protects source queries/routes, search and notifications, including related task/doc and activity data. Personal tasks have no implicit admin bypass; financial review and selected-meeting administration use explicit role grants. See [unit 23](feature-specs/23-global-search-notifications-header.md) for migration and rollout details.

### Org Role (Clerk-native, binary)

- Clerk provides identity for every member; only authenticated members can access protected routes. `proxy.ts` only establishes the Clerk auth context (`clerkMiddleware()`) — it does not gate access by path. Protection is resource-based: `app/(app)/layout.tsx` redirects unauthenticated visitors for every page under it, and every `app/api/*` route checks `auth()` itself and returns `401` when signed out. This follows Clerk's own current guidance away from `createRouteMatcher`-based middleware gating.
- Every member holds a Clerk org role: `org:admin` or `org:member`. The session identifies the user and active organization; authorization rechecks the role against Clerk's organization-membership API on each request. It is never cached or duplicated as a field on the `Member` table.
- Member roster reads reconcile Clerk's complete active organization membership list into the local `Member` profile table before returning dropdown/checkbox options. This creates newly accepted teammates and refreshes their name, email, and avatar without waiting for their first Damgo Hub page load; queries exclude local profiles no longer present in the Clerk organization. Clerk remains the membership source of truth, while PostgreSQL supplies stable relational IDs used by assignments and other domain records.
- Exactly two people hold `org:admin` at any time: the **Leader** and the **Assistant Leader**. No one else can hold it, and no UI in the app exposes a way to self-select or grant it outside the one flow described below.
- `org:admin` gates: access to the Admin Side, oversight of financial transactions and penalties, and — critically — the authority to assign functional/work-distribution role tags (see below) to any member.

### Leader (app-level, on top of Clerk)

Clerk's default org roles don't distinguish an "owner" from a regular admin, but one rule needs exactly that distinction: **only the Leader may appoint or replace the Assistant Leader.** The Assistant Leader (an `org:admin` themself) cannot promote a third person to `org:admin`, and no one can promote themselves.

- `Member.isLeader` is a boolean, true for exactly one member (seeded to the org's actual leader — see `context/team-roster.md`).
- It is not editable through any app UI — it's fixed operational data, set directly in the database if the org's leadership ever changes.
- The one thing `isLeader` gates: calling Clerk's organization-membership API to grant or revoke `org:admin` on another member (the "Assign Assistant Leader" action in `05-member-directory.md`). Everything else `org:admin` normally does, the Leader and Assistant Leader do identically.

### Functional Role Tags (app-level, not Clerk)

Separate from the Clerk admin/member split, every member can hold any number of descriptive role tags — people commonly hold several at once. These live in Prisma (`MemberFunctionalRole`, `MemberWorkDistributionRole`), not Clerk, since Clerk org roles are not designed for open-ended multi-valued tagging. Only `org:admin` members can assign or remove these tags on any member's profile — regular members cannot self-assign them. See `context/team-roster.md` for the current tag values and who holds them, and `04-core-schema.md` for the schema.

### Project and Room Access

- Project proposals have an owner (the proposing member) and assigned collaborators; only the owner or an assigned collaborator can mutate a project's tasks, milestones, or roadmap.
- The Ideas board is open to every authenticated member — there is no per-idea ownership restriction on viewing or posting.
- Liveblocks room tokens are issued only after verifying the member's access to that room (project membership for a roadmap room; any authenticated member for the ideas room).

## Real-Time Collaboration Model

Liveblocks + React Flow back two distinct collaborative surfaces. Both share the same underlying node/edge canvas schema so canvas components are reusable across surfaces.

### Project Roadmap

- One Liveblocks room per project.
- React Flow canvas used to lay out milestones and their relationships.
- Editable by the project owner and assigned collaborators.

### Meeting Planning

- Meetings, participants, and agenda proposals are relational PostgreSQL records.
- Participants submit agenda proposals; only the Leader and Assistant Leader can accept them or add and order final agenda items.
- An optional physical location or external meeting URL tells participants where to meet.
- The meeting itself happens outside Damgo Hub; meeting pages do not initialize Liveblocks or provide calls, live notes, recording, or quote capture.

### Ideas Board

- A single shared Liveblocks room, open to all authenticated members.
- Freeform canvas for posting and browsing ideas — no project or meeting scoping.

## Background Jobs Model (Trigger.dev)

Background jobs are scheduled/reminder-driven, not AI generation. Current job types:

- **Meeting notifications** — send participant invitations, changes, cancellations, and 24-hour/1-hour reminder emails through Resend. Immediate notification intent is committed to a PostgreSQL outbox with the meeting mutation before Trigger.dev is called; a periodic worker recovers pending records after an enqueue outage.
- **Calendar reminders** — notify members ahead of deadlines and calendar events.
- **Penalty escalation checks** — recurring scan for unresolved or overdue penalties.
- **Financial summaries** — recurring generation of budget/transaction summaries for admin review.
- **Google Calendar sync** (`sync-calendar-item-to-google`, implemented in `10-calendar.md`) — request-triggered, not scheduled: pushes a `Task`'s due date or a `CalendarEvent` onto every relevant member's own Google Calendar (via their Clerk-held Google OAuth token). "Relevant" means a task's assignees, a meeting's participants, or every member for anything group-wide (unassigned task, or any `CalendarEvent` — those have no individual-assignment concept at all). Meetings joined this job on 2026-09-08.

Request handlers only enqueue these jobs; they never run the reminder/notification logic inline.

## Search and Notification Storage (Unit 23)

The additive unit 23 migration creates `HubRecord`/`HubGrant`, `HubNotification` and per-member state, preferences, recents and comments. PostgreSQL triggers transactionally project relational source changes and create durable notification intent; Liveblocks ideas use a serialized server reconciliation. Search stays server-side with generated weighted `tsvector`, GIN/trigram indexes and one-edit title matching. Delivery rechecks live membership, grants and preferences; per-user suppression does not replay on later opt-in. Legacy broadcasts retain concrete recipients/read state without historical email. A per-minute Trigger.dev worker produces due reminders and sends opted-in email with bounded attempts and Resend idempotency; existing meeting outbox delivery is preference-aware.

Recommended projection maintenance is transactional write-through for relational mutations plus reconciliation for missed writes and Liveblocks idea snapshots. Ideas remain collaborative canvas records; PostgreSQL gets a searchable projection, not a competing source of truth. Generated vectors update projected text automatically but do not synchronize domain tables. Proposed inbox delivery uses visible-tab polling (15 seconds, near-real-time) and the existing Trigger.dev/Resend stack for durable delivery. No external search service or Supabase dependency is needed. These are recommendations, not deployed infrastructure.

## Invariants

1. Request handlers do not run long-lived or scheduled work — that belongs in Trigger.dev background jobs.
2. Relational records of truth live in PostgreSQL; large or generated artifacts live in Vercel Blob and are referenced by URL, never duplicated into the database.
3. Auth, role, and ownership checks are enforced at every mutation boundary — Admin-only actions must verify the Clerk `org:admin` role server-side, not just hide UI.
7. `org:admin` is granted or revoked on another member only through the Leader-gated "Assign Assistant Leader" flow — never through a generic role-edit form, and never by a member acting on themself.
4. Client components are used only where browser interactivity or Liveblocks real-time state requires them.
5. The canvas node/edge schema stays consistent across the roadmap and ideas board surfaces.
6. Financial transactions and penalties are corrected via new adjustment records, not edits to settled records — both need an audit trail.
8. All money in the app is Philippine Pesos (PHP) — single currency, no currency field anywhere. Every monetary amount is stored as an integer number of centavos, never a float, and rendered for display only through the shared `formatPHP()` helper (`lib/currency.ts`). See `07-financial-tracker.md`'s Currency section.
9. Mobile browsers are a required client of the same application. Mobile layouts must preserve permitted workflows and use the same server authorization, validation, and persistence boundaries as desktop. A responsive viewport must not weaken access checks or require a separate backend. See the [project-wide mobile requirement](project-overview.md#required-browser-support).

## Real user performance monitoring

Speed Insights collects browser vitals through the root layout. An authenticated workspace collector uses `web-vitals/attribution` for CLS/LCP/INP and a separate Event Timing observer for slow interactions. `POST /api/rum` validates same-origin bounded payloads and uses the existing workspace membership guard. `RumSample` deduplicates latest per-page vitals and individual slow interactions; `RumVitalP75` stores hourly rolling seven-day percentile snapshots computed by `src/trigger/rum-rollup.ts`. Client release and normalized route/device dimensions support comparisons without storing member identity or UI text. This telemetry is diagnostic, never a domain source of truth. See [RUM activation, queries and limitations](current-issues/current-issues-real-user-monitoring.md).

## Runtime placement and request latency

Vercel Functions are pinned to `sin1` in `vercel.json`, matching the Prisma Postgres `ap-southeast-1` deployment configured by `prisma-composer.config.mjs`. Keep compute and relational data in the same Singapore region; moving either side requires moving the other or explicitly accepting cross-region round trips. Server loaders batch independent work with `Promise.all`, share request-local Clerk/member/settings reads through React `cache`, and use set-based visibility/member reconciliation instead of query-per-row loops. See the [server latency audit](current-issues/current-issues-server-latency.md).
