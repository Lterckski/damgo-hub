# Global Search, Notifications, and Header

Status: **Implemented on `feat/global-search-notifications-header`; [implementation PR #23](https://github.com/Lterckski/damgo-hub/pull/23) is open against `main`.** The Part 0 audit was merged in PR #22. The user subsequently authorized “build it and pr it”; that supersedes the audit's confirmation gate. Production deployment and authenticated browser verification are not claimed.

Open notification defects and the pending notifications audit are tracked in [notification issues](../current-issues/current-issues-notifications.md).

## Implementation decisions and delivery (2026-09-06)

- The protected app layout now renders `AppHeader`: desktop search, Clerk organization switcher, quick-create menu, notification bell, effective role and account controls. Mobile collapses utilities into the account menu. The bottom dock and scrolling `main` remain. System/Light/Dark selection persists in `damgo_theme`, read on the server before paint.
- `lib/hub/visibility.ts` supplies the shared user/org/project/role audience policy. Personal tasks have no admin bypass. Source pages, APIs, related task/doc queries, activity feeds and admin summaries apply the same grants as search and notifications. Financial review and selected-meeting administration use explicit admin grants; personal financial decision notifications still go only to the submitter.
- **Single-organization deployment binding is the implemented boundary.** `HubWorkspace` binds this existing singleton database, settings and board rooms to the seeded leader's verified Clerk organization. Every request checks active organization and live membership; selecting another organization fails closed. `CLERK_ORGANIZATION_ID` can disambiguate the leader's memberships, and is verified before first binding. This deliberately replaces the audit's proposed per-domain org-column rollout for the current single-org app. It does not make legacy source tables multi-tenant. Supporting a second org still requires migrating all source ownership, references, singleton settings, rooms and workers first.
- `HubMembership` is a reconciled delivery projection, not the role authority. Requests and the scheduled worker refresh Clerk membership. Effective View as Member downgrades the request role.
- The additive `20260906090000_hub_search_notifications` migration creates the projection/grants, inbox/state/preferences, recents and comments. Transactional PostgreSQL source triggers keep relational search grants/text and event intent aligned across existing/admin mutation paths. This replaces the proposed application-only projection hooks. Deletions cascade into recents/inbox. FTS uses weighted title/body `tsvector`, GIN and `pg_trgm`; a one-edit title-token fallback covers short typo queries. Search executes on the server, rechecks visibility, ranks titles first and caps each of nine groups at five.
- Legacy tasks with no assignees retain org visibility. Named assignee lists stay personal, even if they happened to include the whole roster. New whole-org/project intent is explicit. `TaskAssignee.acceptedAt` records individual acceptance, preserved on unchanged reassignment. Deleting a project preserves its task audiences as named recipients before detaching the tasks. Legacy meetings retain participant audiences; new meetings can explicitly select the whole organization.
- The palette supports Cmd/Ctrl+K, keyboard results, escaped highlights and empty-state Recent/Quick actions/Needs you/Jump to. Admin's local palette uses Shift+Cmd/Ctrl+K. Actual record/dialog opens persist recents with serialized deduplication and a 20-row cap. Needs you reuses the authorized dashboard source.
- Real notification producers cover assignment, overdue tasks, penalties, financial review/decisions, meetings and 15-minute reminders, announcements, comments/mentions, broadcasts and relational project milestone completion/blocking. `/records/[recordId]` provides authorized destinations and comment/mention/milestone controls. Mentions never grant source access. Milestone state transitions emit transactionally and repeated identical state does not replay events. Roadmap canvas milestones remain a separate canvas model; this change's milestone actions operate on dated `ProjectMilestone` records.
- Header task/meeting modals reuse existing forms; expenses use the member-safe dashboard endpoint. Docs, announcements and ideas create in place. Idea creation uses the installed Liveblocks server `mutateFlow` API with a stable node ID and serialized search reconciliation; successful snapshots and the worker reconcile canvas changes. Legacy ideas retain unknown timestamps rather than invented creation dates.
- Inbox delivery uses visibility-aware 15-second polling while visible, focus/online refresh and error backoff. Counts and All/Unread/Mentions apply the same state/scope rules. Read/dismiss/eligibility are per member. Legacy broadcast import preserves concrete recipients and read timestamps without sending historical email. Type opt-outs are captured at emission so later opt-in does not replay suppressed events.
- `hub-notification-sweep` refreshes membership, generates due reminders, reconciles ideas and drains email intent with bounded retries, live visibility/preference checks and provider idempotency. Existing meeting invite/change/24h/1h email retains its outbox, now checks membership and notification preferences; the new worker owns 15-minute email to avoid duplication.

### Verification and rollout

Validation uses isolated PostgreSQL 16 on localhost port 55432, never the configured developer or production database. It covers real migrations/triggers, scope denial, search ranking/typos, recents, reassignment, per-user notification state, preferences, deduplication, finance decisions, mentions and milestone transitions, alongside existing unit tests and palette component tests. Final test/build results are recorded in `progress-tracker.md`. Browser automation could not initialize (`node:process` import rejected), so signed-in mobile/layout/focus flows and external Clerk/Liveblocks/Resend delivery still need deployment QA.

On merge, the existing Vercel production build runs `prisma migrate deploy` before `next build`; PostgreSQL must allow `pg_trgm`. Preview builds skip migrations and therefore require their own migrated database. Verify the seeded leader/Clerk org binding, deploy the Trigger.dev worker, and configure the existing Resend sender/`APP_URL` values. No production database, worker or deployment has been changed by this implementation turn.

## Historical audit and acceptance contract

The sections below preserve the original audit and proposed rollout. Where they say confirmation is pending or describe proposed storage, the implementation decisions above supersede them.

## Goal and boundaries

Add one global search palette, a scoped notification inbox, and a complete app header for the five-person team. Keep PostgreSQL, Prisma, Clerk Organizations, Trigger.dev, Resend, Liveblocks, and the existing navy/teal theme with serif page headings. Do not add an external search service. Preserve the bottom dock and separate editor/workspace chrome.

The requested first step is explicit: report what exists, what is missing, and what needs a migration, then wait for confirmation before building. This context-only change satisfies that audit step; approval to open its PR is not approval to implement the feature.

## Part 0 — What exists

Paths below are relative to the repository root. Findings describe checked-in code, not a verification of production data or configured services.

| Area | Existing implementation | Missing or conflicting requirement |
| --- | --- | --- |
| Header | `components/chrome/app-navbar.tsx`: dashboard-linked logo/wordmark, `h-14`, border and `rightSlot`. `app-shell.tsx`: header outside the scrolling `main`, bottom dock. | No search, bell, org switcher, global create menu, role badge, preferences, or count skeleton. Preserve the fixed-height scroll chain; observe `main` for the scrolled treatment. |
| Account/auth | `app/(app)/layout.tsx` checks `userId`; `dev-user-button.tsx` wraps Clerk profile/sign-out and the admin-only View as Member toggle. `lib/current-member.ts` resolves a global profile and effective Clerk admin role. | Layout and profile resolution do not require an active organization or verify membership. The new boundary must check both, and keep the existing role downgrade behavior. |
| Existing search | `lib/admin/search.ts` builds members/transactions/penalties/projects/docs entries from admin data; `components/admin/command-palette.tsx` filters that array in the browser and opens drawers. | This is not a global server search. No FTS, trigram index, recents, nine-type results, or shared visibility. Its existing keyboard shortcut must not open a second palette. |
| Broadcasts | `prisma/models/broadcast.prisma`, `lib/admin/broadcasts.ts`: audience ALL_MEMBERS/ROLE/PROJECT/MEMBER, concrete recipients, per-member `readAt`. | Useful migration source, not a generic event inbox. No shared org/scope policy, dismissed state, type preferences, bell, or delivery channel selection. Recipient resolution varies by audience; MEMBER/PROJECT cannot be assumed to verify live Clerk membership. |
| Email/jobs | `lib/meeting-notifications.ts`, `src/trigger/meeting-notification.ts`, `meeting-reminder.ts`: transactional outbox, retries, delivery deduplication, Resend invitations/changes/cancellations and 24h/1h reminders. | No 15-minute reminder or general notification emitter. Calendar/penalty/finance jobs call deferred logging in `lib/admin-notifications.ts`. Do not describe logged work as delivered. |
| Recommendations | `lib/dashboard/personal.ts#getNeedsYouToday`: overdue tasks, open penalties, meetings within 24h, and the caller's pending agenda proposals. | Extract/share this source after adding org/visibility checks. Pending proposals currently await somebody else's review; they must not be mislabeled as requiring this user's action. |
| Quick create | `components/tasks/new-task-dialog.tsx`, `components/meetings/meeting-form-dialog.tsx`, dashboard `my/quick-capture.tsx`: reusable forms and task/expense/doc inline submissions. | Dashboard idea action navigates to `/ideas`; no inline idea creation endpoint. Main docs dialog navigates after creation. Adapt forms for header-controlled modals and in-place success. Use the standard date-time picker when extracting dashboard forms. |
| Theme | `app/globals.css`, `context/ui-context.md`: system light/dark preference, semantic tokens, Geist and Playfair Display. | No persisted manual theme switch. Header theme control extends the current system-only behavior. |

## Part 0 — Schema and access audit

The domain models below have no `orgId` or common visibility scope. Their existing timestamps and owner relations are useful inputs, but adding organization IDs only to the search table would not make the source data isolated.

| Entity / source | Available data and current access | Work required |
| --- | --- | --- |
| Tasks — `prisma/models/task.prisma` | Title, description, creator, many assignees, optional project, status/priority, start/due/completion timestamps. `/tasks` and GET `/api/tasks` can return all tasks; PATCH `/api/tasks/[taskId]` still permits unrelated authenticated members to edit. | Explicit assignment audience, org ownership, shared reads and mutation checks. Never infer permanent whole-org intent from today's number of selected members. |
| Penalties — `penalty.prisma` | Recipient, issuer, reason, centavos, due date, status, payment claim/dispute. GET filters members to their own penalties; admins see all. | Personal notification scope plus an explicit decision about existing admin oversight. Member “Mark paid” must remain a payment claim, not settlement. |
| Transactions — `transaction.prisma` | Member, category/description, integer PHP amount, approval status, timestamps, optional penalty link. `/finance` reads the shared ledger; admin mutations approve/reject. Dashboard expense submission is member-safe. | Build display titles; personal decision notifications and role-scoped approval requests. Settle record visibility versus the existing shared ledger before migrating access. |
| Projects — `project.prisma` | Name, description/objectives, owner, collaborators, status, timestamps, `blockedReason`, relational `ProjectMilestone` dates/completion. `lib/project-access.ts` checks owner/collaborator access. | Org ownership and shared project scope. A project owner counts as a project member even without a join row. Relational milestones and roadmap canvas nodes are separate sources today. |
| Meetings — `meeting.prisma` | Title, description, organizer, participants, schedule, URL, revision, outbox and delivery rows. `lib/meetings.ts#meetingVisibilityWhere`: participants or admin. | Explicit audience and org ownership; requested org-wide scheduled notifications conflict with today's selected-participant visibility. Add 15-minute scheduling with revision checks. |
| Documents — `doc.prisma` | Title, Markdown content, author, optional project, Drive metadata and private Blob attachments. GET detail allows any authenticated user; edit/delete require author or admin. | Explicit record visibility and protected attachment reads; index stored Markdown/metadata, not inaccessible Drive contents. No comment/mention data model. |
| Ideas — `ideas-board.prisma`, `types/roadmap.ts` | One board row; text/author/color and node IDs live in Liveblocks and a Blob snapshot. `IdeaVote` is relational; `lib/dashboard/ideas.ts` joins votes to snapshot text. | Server-searchable projection, org-scoped board identity, stable record links, timestamp/status mapping and inline creation synchronized with the canvas. Do not create a competing independent idea store. |
| Members — `member.prisma` | Global `clerkUserId` profile, display name/email/avatar, timestamps, status and descriptive role tags. Clerk is the role/membership authority. | Organization membership relation/projection; public search secondary text must avoid unnecessary private contact data. No cached profile role becomes authoritative. |
| Announcements — `announcement.prisma` | Title/body, author, pinned/expiry state, timestamps, per-member dismissals. Dashboard has read/dismiss behavior. | Org ownership, canonical record destination, notification on posting. No announcement creation flow currently exists; add the admin mutation/UI during this feature. |

No general `Notification`, notification preferences/state, search-entry/open-history, comment, or mention models exist. `ProjectMilestone.completedAt` exists, but there is no milestone blocked field or complete event-producing CRUD flow. `ActivityEvent` is not a notification table and must not expose personal events through team summaries.

## Visibility contract — first implementation slice

One canonical `visibilityScope` enum (`user`, `org`, `project`, `role`) and one shared server policy module govern both index entries and notifications. The request also calls this `recipient_scope`; use that as a description of the same field, not a second independently writable scope. Scope is authorization; notification preferences only control delivery and never remove access to search results.

- Derive user identity, active org, effective Clerk role and current project memberships on the server. Never accept those claims from request payloads. A missing org, removed member, unknown scope, or invalid audience fails closed.
- Always require organization equality before evaluating scope. `user` matches exactly one local recipient linked to the authenticated Clerk user; `org` matches current org members; `project` matches current owner/collaborators; `role` matches the current effective Clerk role. An admin has no implicit bypass for a personal task or its notification.
- Apply the same policy in database predicates before ranking, grouping, counts, limits, or pagination, then recheck at each handler/action boundary before serialization or mutation. The TypeScript predicate and SQL/Prisma predicate must share one policy definition and parity tests.
- Revalidate against current source permissions, not an old search snapshot. Reassignment, project removal, role changes, deletion and org switching must immediately stop exposure, including old notifications, snippets, recents and unread counts.
- Update existing record pages, list APIs, detail endpoints, calendar/dashboard queries, admin search/drawers, attachment routes, exports and event feeds that can disclose the same records. A protected palette pointing to an unprotected route does not meet the direct-URL requirement.
- Linked metadata is protected too: a visible task must not reveal a restricted doc title or project details through its secondary line. Write permissions remain distinct and at least as strict as read permissions.

### Decisions to confirm with the audit

1. **Personal task restriction changes admin oversight.** Follow the requested no-exceptions rule: only the assignee reads a personal task, including through admin queries. Creation may assign it to somebody else, but does not grant continuing read access to the creator. Existing oversight counts/queues must be reconciled with that behavior.
2. **Multiple audiences need a precise entity policy.** Recommend one scope per audience grant, allowing an entity to have multiple explicit grants; each notification still has exactly one scope. This supports multiple named assignees without inventing an “everyone” scope, and user plus admin-role grants on financial approval records. If the intended requirement is exactly one audience grant per entity too, finance approval and multi-assignee flows need a different product rule. Search deduplicates by entity, never by grant; no grant may widen a strictly personal task.
3. **Meetings and historical audience backfill.** Recommend explicit org-wide versus selected-person audiences, preserving existing participant-only meetings with individual user grants. New org-wide meetings notify every current org member. Existing all-selected tasks cannot reliably prove org-wide intent; preserve their named recipients until an admin explicitly marks them org-wide. Never silently widen historical records.
4. **Org switching rollout.** Wire Clerk switching and the current-org display, but enable another org's data only after source records, membership relations, settings, background jobs, board rooms and Blob paths are isolated. Until then, fail closed for any org other than the configured deployment org. Full multi-tenant rollout remains a separate scope decision.
5. **Inline “Accept task.”** Tasks have TODO/IN_PROGRESS/DONE and no acceptance state. Recommend an explicit per-assignee `acceptedAt`, with an idempotent accept action; do not silently equate accepting with completing. Preserve separate acceptance for each named recipient.

Confirm these choices before the first implementation slice. Do not resolve a conflict by adding an admin bypass to the shared helper or by broadening private meetings.

## Part A — Global search

Index all nine types: tasks, penalties, transactions, projects, meetings, documents, ideas, members and announcements. Earlier overview text included agenda items; those remain outside this initial nine-type index, while meeting results can show authorized agenda context.

Each entry needs an index ID, stable entity ID/type, title, searchable text and display snippet, owner/assignee IDs, nullable project ID, org ID, status, source created/updated timestamps and canonical visibility grant(s). Resolve `lastOpenedAt` from the current user's history rather than storing one user's timestamp on the shared entry. Types without a native status use an explicit display mapping such as document “Published” or announcement “Pinned/Archived”; do not fabricate source timestamps for legacy canvas notes. Record migration-time observation separately where history is unavailable.

Use a PostgreSQL search projection with a generated stored `tsvector`, GIN index and `pg_trgm` title index. The generated column keeps the vector in sync with its own text columns; it does not copy domain tables into the projection. PostgreSQL documents both [generated search vectors and GIN indexing](https://www.postgresql.org/docs/current/textsearch-tables.html) and [trigram similarity/index support](https://www.postgresql.org/docs/current/pgtrgm.html).

Recommend transactional write-through from shared domain mutations for relational projection updates/deletes, plus a reconciliation/backfill job. This makes user writes searchable at commit and keeps transformations in tested application code; the tradeoff is that every write path, including admin/bulk jobs, must use it. Database triggers cover direct SQL writes more reliably but spread domain mapping into SQL and cannot observe Liveblocks. Use server-validated board snapshot/revision reconciliation for ideas; reject older revisions and remove deleted nodes from the projection. Snapshot indexing is eventually current, so quick creation should refresh the projection after the confirmed collaborative write. Keep authorization current independently of text freshness.

- Desktop header input remains visible; mobile icon opens a full-screen palette. Global ⌘K/Ctrl+K opens it; Esc closes; ↑/↓ select; Enter opens; ⌘Enter (and Ctrl+Enter on Windows/Linux) opens a new tab. Provide one global shortcut owner on `/admin` while retaining explicit access to its console drawer search.
- Debounce about 150 ms, cancel/ignore superseded requests, and clear results/cache on user/org/role change. Never send the full index to the browser.
- Title exact/prefix/fuzzy matches always rank above body-only matches. Apply interaction-recency, own assignment/ownership and overdue boosts only within that title-first ordering; break ties deterministically.
- Support `doc` → “Documentation Formatting” and one-character insert/delete/substitute typos. Trigram thresholds alone do not guarantee edit-distance recall, especially for short input: include a tested server-side title-token edit-distance fallback over the authorized candidate set.
- Group by entity type, at most five rows each. Every row has an icon, title, relevant project/assignee/date/amount secondary text and status badge. Render safe text highlight ranges, never unchecked HTML. Bound query length/result size and parameterize all SQL.
- With empty input show, in order: **Recent** (last five opens), **Quick actions** (New task, Log expense, New idea, New meeting), **Needs you** (up to three overdue/actionable items from the dashboard source), **Jump to** (Dashboard, Tasks, Finance, Calendar, Projects, Docs, admin-only Admin). Show useful no-results/loading/error messages.
- Persist an actual record open from any entry point, including direct navigation and detail dialogs; no writes from hover, prefetch or result rendering. Upsert history unique by org/user/type/entity, move repeat opens to the top, cap at 20 with transactional oldest eviction, and provide Clear recent. Exclude inaccessible/deleted items at read time.
- Add record-addressable destinations for dialog-only entities and ideas/announcements, with server authorization and selection of the specific record. A route to a generic list is insufficient for Enter/new-tab behavior. Record-open tracking runs after access succeeds, including in the destination tab.

## Part B — Notifications

Store `Notification`: id, orgId, visibilityScope, nullable recipientId (validated according to scope), actorId, entityType/entityId, action/type, title, body, safe URL, createdAt, and an idempotent source-event key. Project/role targets must be unambiguous and constrained; org scope needs no recipient ID. Actor deletion must preserve safe historical attribution without granting access.

Store separate `NotificationUserState` unique by notification/user with `readAt` and `dismissedAt`. Never place `isRead` on a shared notification. Keep announcement dismissal independent from inbox read/dismiss. Migrate existing broadcasts into notifications with their original recipients/read times preserved, stable migration IDs, and no historical email resend; changing a ROLE/PROJECT audience must not retroactively widen the historical recipient snapshot.

| Trigger | Audience / action |
| --- | --- |
| Task assigned | Assignee user, all org members for explicit org tasks, or project audience for explicit project tasks; Accept when supported. |
| Owned/assigned task becomes overdue | Current eligible owner/assignee; deduplicate per due-date revision and recheck completion before delivery. Strict personal-task access still wins over creator identity. |
| Penalty issued or due soon | Recipient only; Mark penalty paid submits the existing claim for admin confirmation. Reuse the effective due-date calculation, including configured fallback for legacy rows. |
| Transaction approved/rejected | Submitting member; never share the decision message with unrelated members. |
| Transaction awaits approval | Role `org:admin`; Approve revalidates role, source visibility and current PENDING state, and writes the existing audit trail. |
| Meeting scheduled/changed/15 minutes away | Explicit meeting audience; Join only when a valid authorized meeting URL exists. Recheck revision/time/participants; cancel obsolete reminders. Preserve existing 24h/1h email behavior subject to preferences. |
| Mention in comment/doc | Mentioned user, only if already allowed to read the target. Mentions never grant access. |
| Comment on an owned record | Eligible owner. Requires actual comment persistence and mutation paths; raw `@name` string matching is not a complete mention system. |
| Announcement posted | Org members; requires the posting mutation/UI as well as the notification hook. |
| Project milestone reached/blocked | Project members; define one authoritative event source and bridge roadmap edits to it. Add blocked state and mutation hooks rather than pretending the existing dated milestone rows already emit events. |

Build minimal comment/mention authoring and persistence for the requested record/doc flows, validated member references, and event hooks in the approved slices. None of these triggers is complete until there is a real producer; mocked inbox rows and unused emit functions do not count.

Write notification intent with the domain transaction. Reuse the meeting outbox/idempotency approach for background fan-out and email; no network send inside the transaction. Revalidate recipient membership, scope and preferences at delivery/retry time. Deduplicate each source event/recipient/channel; a retry must not create duplicate inbox rows or emails.

Bell UI: unread badge capped at `9+`; Today/Earlier groups in team timezone; actor avatar/fallback, action text, relative time, distinct unread treatment and eligible inline actions. Tabs: All/Unread/Mentions. Include Mark all as read, per-row dismiss, genuine empty/error states, and row navigation that also marks read. Inline actions must not accidentally activate row navigation. Bulk reads and dismissals operate only on the caller's currently visible notifications; every count uses the same scope/preferences/dismissal rules as the list.

Preferences: a per-user/per-org panel with event-type on/off and in-app only versus in-app + email. Recommended defaults: in-app enabled for supported types, existing meeting email retained, new email categories opt-in. Evaluate toggles at event fan-out and again before send; for shared org/project/role records persist per-user delivery eligibility so enabling a type later does not resurrect events suppressed at send time. Channel preference does not change search access. Decide explicitly how legacy broadcasts are presented during migration.

Delivery recommendation: start with **near-real-time polling**, proposed 15 seconds while the app is visible, immediate refresh when opening the bell or refocusing, pause while hidden/offline and back off on errors. This is a design choice for five users on the existing stack, not instantaneous push. It avoids introducing Supabase or maintaining an SSE stream; if sub-second delivery is required, confirm that requirement before substituting a push transport. Poll only scoped counts/deltas, with no shared user-response cache.

## Part C — Complete header

- Left: existing dashboard-linked logo, Clerk organization switcher and current org label. Center: desktop search field with visible keyboard hint. Right: `+` menu, notification bell and avatar menu.
- Quick create: New task, Log expense, New idea, New meeting, New doc, all in modals with in-place success and existing server validation. Reuse the dashboard member expense endpoint, never the admin-only ledger endpoint for members. Share the action registry with search empty-state actions.
- New idea must perform an authorized, idempotent collaborative mutation with stable node ID/position, then update its search projection. Verify the installed Liveblocks server mutation API before choosing that bridge; retain undo/presence and avoid mounting an invisible full canvas just to create a note.
- Avatar: name and effective role badge, Profile, Notification preferences, Theme, admin-only Admin and Sign out; preserve View as Member for real admins. Show org/role visibly on desktop and in the mobile account menu.
- Theme: System/Light/Dark with persisted choice; System remains the default. Keep the existing tokens, dark navy, teal accents and serif headings; add the explicit override without hydration flash.
- Header remains pinned while content scrolls; add a subtle border/blur treatment based on the actual `main` scroll container. Mobile shows logo, search icon, bell, avatar; move organization switching, quick create, theme and remaining controls into the avatar menu.
- Reserve space for bell-count/avatar skeletons to avoid layout shift. Accessible labels, focus rings, Esc dismissal, focus trap and focus restoration in the palette; arrow/Enter behavior across groups and empty-state actions. Use `aria-live` for count changes without repeated announcements on unchanged polls. Test nested menus/dialog transitions and narrow screens.

## Part 0 — Migrations and rollout

No migration is created or applied by this audit PR. Proposed additive groups:

1. Organization IDs on owned records, org membership mapping for global Member profiles, explicit audience/grant metadata and task acceptance state. Backfill only from a verified existing deployment org; do not guess from the latest session. Validate all cross-entity org references before making fields required. Scope singleton settings/boards and delivery jobs as needed before enabling org switching.
2. Notification, per-user read/dismiss and delivery eligibility, preferences, generalized outbox/delivery records and event uniqueness. Backfill Broadcast/BroadcastRecipient without losing read state or sending email. Add needed producer models (comments/mentions), milestone blocked state and meeting 15-minute revision/run tracking.
3. Search projection, scope grants, unique entity identity, source revisions and open history; generated `tsvector`, GIN and `pg_trgm` indexes via reviewed SQL migrations. Check the target PostgreSQL version and extension availability before deployment; add a tested one-edit fallback without an external service. Add an idea projection and reconcile legacy snapshot content without invented timestamps.

Use expand/backfill/validate/enforce phases and feature-gate surfaces until their sources are protected. Test migration rehearsal against representative legacy records; separately review production application because this checkout is not proof of production schema or data. Rebuild projections safely and idempotently, purge deleted entries/recents, and preserve original delivery history. A rollback can hide new UI, but must not restore broad unauthorized read access.

## Part D — Build order and acceptance

After confirmation, deliver reviewable slices in the requested order. Read installed Next.js guides before code; respect generated Base UI components and existing mutation/audit boundaries.

1. Shared visibility helper, org/audience foundation and existing route/query access fixes first. Resolve the five audit decisions; test denial paths before UI.
2. Notification schema, per-user state, migration bridge and durable event infrastructure.
3. Static header shell with all slots and preserved dock/scroll layout.
4. Bell, dropdown and authorized inline actions; connect real task/penalty/finance/meeting/announcement/project/comment/mention producers as their prerequisites land.
5. Search projection, indexing/backfill and server query.
6. Palette, grouped results, highlighting and record destinations.
7. Open tracking, recents and the four empty-state sections from shared dashboard data.
8. Shared quick-create menu and modal forms, including collaborative idea creation.
9. Notification preferences and theme control.
10. Delivery refresh/polling and preference-aware email/reminder workers.
11. Mobile collapse and accessibility pass.

Acceptance checks must cover:

- User A cannot list, search, count, open by URL, receive or act on user B's personal task/notification, including as an unrelated admin. Test user/org/project/role parity, cross-org IDs, removed members, changed roles and reassignment with stale index/history data.
- Separate read/dismiss/disabled-type state for two users on one org notification; scoped Mark all as read; duplicate/retried jobs; stale meeting revisions; email preferences evaluated again on retry.
- All nine search types; title outranks body despite boosts; own assignment wins an identical-title tie; prefixes and one-character edits (including short words); escaped highlights; no full-index client payload; per-group limit after authorization.
- Recents deduplication, concurrent opens, 20-row eviction, clear, no hover/prefetch writes, direct/dialog/new-tab opens and removal after access revocation. Needs You matches the dashboard's actionable definitions.
- Every quick action creates in place, respects role/assignment rules and validates input; Accept does not complete a task; penalty claims do not settle the ledger; announcement/milestone/mention events have real producers.
- Keyboard shortcut coordination with `/admin`, focus trapping/restoration, mobile sizing, stable skeleton geometry, system/manual themes and live count announcements.
- For implementation slices: targeted policy/database tests, Prisma validation and migration rehearsal, type checking, lint/build and relevant browser checks. For this context-only PR: verify repository evidence, local Markdown links and `git diff --check`; application tests are not claimed as run.
