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

**Planned extension, not implemented:** [unit 23 — Global Search, Notifications, and Header](feature-specs/23-global-search-notifications-header.md) records the Part 0 audit and approval decisions. Domain records currently lack organization IDs and a common visibility policy; adding an org switcher without fixing those boundaries would expose the shared dataset. Clerk remains the identity/role authority. The proposed server policy evaluates `user`/`org`/`project`/`role` resource scopes for search, notifications and the underlying routes, with no implicit admin bypass for personal tasks. This conflicts with some existing oversight/meeting/ledger behavior and must be confirmed before implementation; current behavior below remains an implementation description.

### Org Role (Clerk-native, binary)

- Clerk provides identity for every member; only authenticated members can access protected routes. `proxy.ts` only establishes the Clerk auth context (`clerkMiddleware()`) — it does not gate access by path. Protection is resource-based: `app/(app)/layout.tsx` redirects unauthenticated visitors for every page under it, and every `app/api/*` route checks `auth()` itself and returns `401` when signed out. This follows Clerk's own current guidance away from `createRouteMatcher`-based middleware gating.
- Every member holds a Clerk org role: `org:admin` or `org:member`. This is read live from the Clerk session (`auth().orgRole`) — it is never cached or duplicated as a field on the `Member` table.
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
- **Google Calendar sync** (`sync-calendar-item-to-google`, implemented in `10-calendar.md`) — request-triggered, not scheduled: pushes a `Task`'s due date or a `CalendarEvent` onto every relevant member's own Google Calendar (via their Clerk-held Google OAuth token). "Relevant" means a task's assignees, or every member for anything group-wide (unassigned task, or any `CalendarEvent` — those have no individual-assignment concept at all).

Request handlers only enqueue these jobs; they never run the reminder/notification logic inline.

## Planned Search and Notification Storage (Unit 23)

The [unit 23 audit](feature-specs/23-global-search-notifications-header.md) proposes additive migrations, pending confirmation: organization ownership/audience grants; notification records with separate per-user read/dismiss, delivery eligibility and preferences; generalized durable delivery intent; and a server-only search projection with generated `tsvector`, GIN/trigram indexes and per-user open history. Search authorization must stay current even if projected text is stale. Existing broadcasts/read receipts and meeting outbox history need an explicit migration bridge, not replacement by an empty inbox.

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
