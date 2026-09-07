# Project Tab / Proposal

## Goal

Build project proposals with collaborator (member) assignment: schema, API, and UI. The collaborative milestone roadmap board comes later (`12-liveblocks-setup.md` and `13-roadmap-board.md`) — this unit covers the non-realtime CRUD and access model everything else builds on.

## Schema

Create `prisma/models/project.prisma`.

Add `Project`:

- `id`
- `ownerId` — relation to `Member`. Also surfaced in the UI as **"Team Lead"** — same field, relabeled, not a separate concept; see Implementation Notes
- `name`
- `description` — optional
- `objectives` — optional plain text, what the project aims to achieve
- `status` enum: `PROPOSED`, `ACTIVE`, `COMPLETED`, `ARCHIVED` — defaults to `PROPOSED`, not user-settable at creation
- `priority` enum: `LOW`, `MEDIUM`, `HIGH` — defaults to `MEDIUM`
- `category` enum, optional: `FEATURE`, `RESEARCH`, `INTERNAL_TOOL`, `HACKATHON_ENTRY`, `OTHER` — adjusted to fit an actual hackathon team's proposals, not a generic PM taxonomy
- `startDate` / `targetEndDate` — both optional `DateTime`, date-only (no time component) — a proposal's timeline is coarse planning, not a scheduled event
- `estimatedBudgetCentavos` — optional integer, PHP centavos (see `architecture-context.md` invariant 8 and `lib/currency.ts` — never a float, never formatted ad hoc)
- `roadmapSnapshotPath` — optional Vercel Blob URL, used starting in `15-board-autosave.md`
- timestamps
- indexes on `ownerId` and `status`

Add `ProjectMember`:

- `projectId` relation, cascade delete
- `memberId` relation
- unique constraint on `projectId`/`memberId`
- indexes on `memberId` and `projectId`

Add `ProjectLink` — "Supporting Links" from the New Proposal form:

- `projectId` relation, cascade delete
- `label`, `url`
- timestamps
- index on `projectId`

Now that `Project` exists, connect the `projectId` fields left nullable in `08-task-assignment.md` and `09-documentation.md`. `Task` also gets a `TaskDocument` join table (`taskId`, `docId`, unique on the pair) for the "Related Document(s)" link described in `08-task-assignment.md`.

## Access Helper

Create `lib/project-access.ts`:

- `getProjectAccess(projectId, member)` — returns whether the member is the owner, an assigned collaborator, or neither
- `requireProjectAccess(projectId, member)` — throws/returns a `403` if neither

Every project-scoped route and page uses this helper — do not re-implement the check inline.

## Routes

Create REST endpoints under `app/api/projects`:

- `GET /api/projects` — list projects the current member owns or is assigned to; support `?status=`
- `POST /api/projects` — create a proposal; accepts `name` (required), `description`, `objectives`, `priority`, `category`, `startDate`, `targetEndDate`, `estimatedBudgetPesos` (converted to centavos server-side), `ownerId` (Team Lead — defaults to the creator, validated as a real member if overridden), `memberIds` (initial collaborators, `ownerId` excluded automatically), `links` (`{label, url}[]`)
- `GET /api/projects/[projectId]` — requires access
- `PATCH /api/projects/[projectId]` — rename/describe/change status plus objectives/priority/category/timeline/budget; owner only (Team Lead and Links aren't editable here — see Implementation Notes)
- `DELETE /api/projects/[projectId]` — owner only
- `POST /api/projects/[projectId]/members` — assign a collaborator (owner only)
- `DELETE /api/projects/[projectId]/members/[memberId]` — remove a collaborator (owner only)

Security: unauthenticated requests return `401`; non-owner mutations return `403`.

## Pages

Create `app/(app)/projects/page.tsx` (list) and `app/(app)/projects/[projectId]/page.tsx` (detail shell).

List page:

- shadcn `Tabs`: "My Projects" / "All Proposals"
- card grid: name, status badge, owner, collaborator avatar stack
- "New Proposal" button opens a `Dialog` (`components/projects/new-project-dialog.tsx`) — only **Name** is required, everything else is optional or defaulted, so a quick proposal takes ten seconds and a fleshed-out one can carry the rest:
  - Name (required), Description, Objectives — top, as free text
  - Proposed Start / Target End (both optional, date-only via `components/shared/date-time-picker.tsx` with `includeTime={false}`), Priority (defaults Medium), Category — grouped together
  - Team Lead (Select, defaults to the creator, changeable to any member — this **is** `ownerId`, see Implementation Notes) and Team Members / Collaborators (checkbox list, excludes whoever is currently picked as Team Lead) — grouped together
  - Estimated Budget (PHP) and Supporting Links (repeatable label+url rows, "Add Link") — visually set apart as "Optional details" near the bottom so they don't make a quick proposal feel like a chore

Detail page (server component, uses `requireProjectAccess`):

- unauthorized or missing projects render an `AccessDenied` component (centered layout, lock icon, short message, link back to `/projects`)
- header: project name, status, owner
- "Manage Collaborators" opens a `Dialog` — owner can search/add members by name and remove existing ones; collaborators see the list read-only
- a "Roadmap" tab placeholder, wired up in `13-roadmap-board.md`

## Implementation Notes

A few specifics the one-line spec bullets above didn't pin down, decided while building:

- **`requireProjectAccess` never throws or returns an HTTP response itself** — it returns `"owner" | "collaborator" | null`, same shape as `getProjectAccess` (they're identical; `requireProjectAccess` is just the semantically-named call site for "I'm about to act, not just check"). Each caller decides what "no access" means for it: a route turns `null` into `NextResponse.json({...}, {status:403})`, the detail page turns it into `<AccessDenied />`. Keeping the helper response-format-agnostic is what let one function serve both routes and a Server Component page.
- **Task/Doc → Project uses `onDelete: SetNull`, not the default `Restrict`.** A task or doc linking to a project shouldn't block that project's deletion, and definitely shouldn't cascade-delete unrelated work — deleting a proposal just unlinks anything that pointed at it (`projectId` goes back to `null`), same as it was before the project existed.
- **"All Proposals" shows every project in the org, not just ones the viewer has access to** — a deliberate reading of the tab name as an open discovery list (so the team can see what's being proposed and ask to join), while the **detail page still enforces real access** via `requireProjectAccess`/`AccessDenied` regardless of how someone got the link. The list and the detail page intentionally have different visibility rules.
- **Editing (name/description/status) is inline, not a popup** — `components/projects/project-detail.tsx` follows the same pattern `components/docs/doc-detail.tsx` settled on (see `09-documentation.md`): clicking Edit swaps the header/description directly into editable fields in place, Save/Cancel replacing Edit/Delete. The spec's Dialogs are for "New Proposal" (a short, bounded action — starting a page) and "Manage Collaborators" (`components/projects/manage-collaborators-dialog.tsx`, the same component either way — owner gets a search-and-add box plus remove buttons, a collaborator sees the identical list with those controls hidden) — editing an existing, potentially-long proposal isn't either of those.
- `components/shared/access-denied.tsx` is intentionally generic (`backHref`/`backLabel` props, not hardcoded to `/projects`) — built to be reused by any future access-gated resource with the same owner/collaborator model, not just this one.
- **Team Lead reuses `ownerId` rather than being a separate field** — an explicit decision the user confirmed directly when asked (the alternative was a purely-informational `teamLeadId` with no permission effect). Picking a Team Lead other than yourself at creation hands that person full edit/delete/manage-collaborators access immediately.
- **Editable via `PATCH`: name, description, objectives, status, priority, category, timeline, budget.** Not editable via `PATCH`: Team Lead (`ownerId`) and Supporting Links — reassigning ownership after creation and managing links both stayed out of scope for this pass rather than folded into the general update route. Team Members/Collaborators keep their own dedicated `POST`/`DELETE .../members` routes, unchanged from the original design.
- **A task can only link to a `PROPOSED` or `ACTIVE` project**, not `COMPLETED`/`ARCHIVED` — the user's explicit call when asked directly, since the original ask ("Approved"/"In Progress") didn't map onto this schema's actual four statuses. See `lib/projects.ts`'s `TASK_LINKABLE_PROJECT_STATUSES`, enforced both in `POST`/`PATCH /api/tasks` and in which projects the New Task/task-detail dropdowns even offer.

## Proposal Approval Flow

Requirement recorded 2026-09-07. A project a member proposes does not become an active project on its own — it needs an Admin decision first. This **supersedes** the current rule that the owner may set `status` freely through `PATCH /api/projects/[projectId]`.

### Required States

The status is the single source of truth for whether work has been authorized. Nothing else — a filled-in timeline, an assigned collaborator, a linked task — implies approval.

| State | Meaning | Who moves it there |
| --- | --- | --- |
| `PROPOSED` | Submitted, awaiting an Admin decision. The default at creation and still not settable by the proposer. | any member, by creating a proposal |
| `ACTIVE` | Approved. The only transition that turns a proposal into a project the team works on. | `org:admin` only |
| *rejected* | Declined by an Admin. **Not representable today** — `ProjectStatus` has no such value (see Open Questions). | `org:admin` only |
| `COMPLETED` | Approved work that finished. Reachable only from `ACTIVE`. | owner or `org:admin`, unchanged |
| `ARCHIVED` | Retired, kept for history. Reachable only from `ACTIVE`. | owner or `org:admin`, unchanged |

- Creation always persists `PROPOSED`; `POST /api/projects` continues to ignore any client-supplied status. Nothing can be created directly as `ACTIVE`.
- `PROPOSED → ACTIVE` and `PROPOSED → rejected` are Admin-only transitions. A proposal's own owner cannot make them by being the owner. (Whether an Admin may decide their own proposal is unresolved — see Open Questions.)
- A decision is recorded, not just applied: who decided, when, and for a rejection a required reason, through the existing append-only `lib/audit-log.ts` and its `requireReason()` enforcement.
- `TASK_LINKABLE_PROJECT_STATUSES` still allows `PROPOSED` and `ACTIVE`; a rejected proposal must not be task-linkable.
- `/admin`'s existing Action Queue already lists `PROPOSED` projects and approves through `setProjectStatus(actor, id, "ACTIVE", reason)` (`lib/admin/mutations.ts`). The views below surface the same decision — they must call that same server module and write the same audit entry, not open a second approval path with its own rules.

### Views

The projects list separates three distinct views. They are separate destinations with their own contents and their own actions, not one grid behind a status dropdown.

| View | Contents | Who sees it | Actions in it |
| --- | --- | --- | --- |
| My Projects | Projects the viewer owns or collaborates on. | every member | open; the owner's existing inline edit and Manage Collaborators |
| Proposed Projects | Proposals in `PROPOSED`. **Whose** — the viewer's own submissions or the org-wide pending queue — is unresolved (see Open Questions), and the answer decides who sees this view. | unresolved | `org:admin`: Approve and Reject inline. Members: read-only, with no decision control rendered |
| All Proposals | Every project in the org, deliberately not access-filtered — the existing open discovery list. The detail page still enforces `requireProjectAccess` regardless of how someone reached it. | every member | open; `org:admin` may decide a `PROPOSED` row from here |

- Each view states its own empty state; an empty Proposed Projects reads as "nothing awaiting a decision," never as an error or an unstyled blank.
- A proposal's state is visible in every view that can show it, using the existing status badge, so "waiting on an admin" is never inferred from which tab the row happens to be in.
- The three views follow the [mobile browser requirements](../ui-context.md#mobile-browser-requirements): all three are reachable and readable at 320 CSS pixels, and Approve/Reject meet the touch-target rule.

### Acceptance Criteria

- `POST /api/projects` persists `PROPOSED` for every caller, including an Admin and including a body that supplies `status`.
- `PATCH /api/projects/[projectId]` returns `403` when a non-admin sends a status change, while the owner's other edits (name, description, objectives, priority, category, timeline, budget) still succeed.
- An `org:member` cannot reach `ACTIVE` through any route — project PATCH, the admin routes, or a bulk action — and a captured or hand-crafted request from that account is refused server-side, not merely hidden in the UI.
- Approving writes exactly one audit entry naming the actor and the project; rejecting is refused without a reason.
- Deciding an already-decided proposal returns `409` rather than applying twice, matching the existing "already decided" behavior on finance transactions and agenda proposals. This is also what makes the Approve/Reject buttons safe under [single activation](../ui-context.md#single-activation-action-buttons).
- The proposer is notified of the decision in the header inbox, per the documented trigger list in [project-overview.md](../project-overview.md#notifications--announcements-hub). Implemented at `project` scope, which is the audience a project record already grants — the proposer always receives it (an owner is a project member) and so do the collaborators. It grants no access anyone did not already have. A proposer-only notification would have required giving projects a `user` grant they do not have today.
- My Projects, Proposed Projects, and All Proposals each render their own contents; no view is a client-side filter over a payload containing rows the viewer may not see.
- A member sees no Approve or Reject control in any view, on any breakpoint.
- Every surface that reads project status — dashboard cards, `/admin` stats and Action Queue, search results, task project pickers — derives it from the same status field, so an approval is reflected in all of them without a second write.

## Check When Done

- proposals can be created, listed, renamed, and deleted by their owner
- a proposal reaches `ACTIVE` only through an Admin decision, enforced server-side, and every Proposal Approval Flow acceptance criterion above passes
- collaborators can be assigned/removed by the owner only
- `AccessDenied` renders for members without access
- `npm run build` passes

## Open Questions

Recorded 2026-09-07 with the Proposal Approval Flow requirement. The flow was then implemented the same day on the user's instruction to build all four requirements without waiting for these answers, so each one below carries the assumption that was coded. **These are decisions the user has not made** — changing any of them is a code change, not just a doc edit.

- **What is "Proposed Projects"?** *Built as (b), the org-wide pending queue, visible to every member with Approve/Reject rendered only for admins.* Two readings: (a) the viewer's own submissions awaiting a decision — a personal "what I sent in" view every member gets; or (b) the org-wide pending queue — effectively an admin review list. The answer decides who the view is for, whether members see it at all, and whether it duplicates `/admin`'s existing Action Queue entry for `PROPOSED` projects or replaces it.
- **Does "All Proposals" keep its current meaning?** *Left unchanged — still every project at any status.* Today that tab shows every project in the org at any status, as a deliberate discovery list. Should it stay that way, or narrow to proposals only — and if rejected proposals become representable, do they appear there?
- **How is a rejection stored?** *Built as a new `REJECTED` enum value (migration `20260907120000_project_approval_flow`), terminal, and not task-linkable. Resubmission is not implemented.* The options were: add `REJECTED` to `ProjectStatus` (a migration and a new terminal state), keep the row `PROPOSED` with a separate decision record, or archive it? Related: may a rejected proposal be revised and resubmitted, and does that reuse the same record or create a new one?
- **May an Admin approve their own proposal?** *Built as allowed — no self-approval block.* There are exactly two `org:admin` seats. Requiring a second Admin means the Leader and Assistant Leader can never self-start a project without the other one being available.
- **Is approval a plain yes/no?** *Built as a plain yes/no; an admin cannot edit the proposal as part of deciding it.* Can an Admin edit the proposal — budget, timeline, Team Lead, collaborators — as part of approving it, or does approval accept exactly what was submitted, leaving edits to the owner afterwards?
- **Can a member still delete their own `PROPOSED` proposal?** *Left unchanged — deletion is still owner-only, at any status.* Deletion is owner-only today. Does that survive, and can anything delete an `ACTIVE` project, or does `ARCHIVED` become the only exit?
- **Where does "My Projects" draw the line?** *Left unchanged — every project the viewer owns or collaborates on, at any status, so their own pending proposal does appear in both My Projects and Proposed Projects.* Approved projects only, or does it also include the viewer's own pending proposals — which would put the same row in two of the three views?
