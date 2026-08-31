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

## Check When Done

- proposals can be created, listed, renamed, and deleted by their owner
- collaborators can be assigned/removed by the owner only
- `AccessDenied` renders for members without access
- `npm run build` passes
