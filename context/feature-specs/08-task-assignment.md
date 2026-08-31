# Task Assignment

## Goal

Build task creation, assignment, and status tracking: schema, API, and UI, in one unit.

## Schema

Create `prisma/models/task.prisma`.

Add `Task`:

- `id`
- `title`
- `description` — optional
- `status` enum: `TODO`, `IN_PROGRESS`, `DONE` — defaults to `TODO`
- `type` — **mandatory**; reuses `FunctionalRole` (`member.prisma`: Pitching, Documents, Creatives, Production, Quality Assurance, Marketing, Model) rather than a separate enum — one taxonomy for "what kind of work is this," shared between task types and Member Roles, per the user's explicit call
- `startDate` — **mandatory**, date and time (labeled "Start" in the UI) — a task's start is a real moment, not just a day, per the user's explicit call
- `dueDate` — **mandatory**, date and time (labeled "End" in the UI) — what Google Calendar Sync (`10-calendar.md`) uses for the synced event's end (`startDate` is the event's start)
- `createdById` — relation to `Member`
- `projectId` — optional relation to `Project` (the `Project` model doesn't exist until `11-project-proposals.md`; add the field now as a nullable string/relation and connect it once `Project` exists)
- timestamps
- indexes on `status`, `type`, and `projectId`

Add `TaskAssignee`:

- `taskId` + `memberId` relation (a task can have more than one assignee)
- unique constraint on `taskId`/`memberId`

Add `TaskDocument` (added alongside `11-project-proposals.md`'s Project→Task link, for the "Related Document(s)" field below):

- `taskId` relation, cascade delete
- `docId` relation, cascade delete
- unique constraint on `taskId`/`docId`
- indexes on both

## Routes

Create REST endpoints under `app/api/tasks`:

- `GET /api/tasks` — list tasks; support `?assignee=me`, `?projectId=`, `?status=` filters
- `POST /api/tasks` — create a task with initial assignees; reject if `title`, `type`, `startDate`, or `dueDate` is missing/invalid. Also accepts `projectId` (optional — see the project-linking rule below) and `documentIds` (optional array, creates `TaskDocument` rows)
- `PATCH /api/tasks/[taskId]` — update title/description/status/type/startDate/dueDate/assignees/projectId/documentIds; `type`/`startDate`/`dueDate` can be replaced but never cleared to empty, since they're mandatory on the record. `projectId: null` unlinks the task from any project
- `DELETE /api/tasks/[taskId]` — creator or an Admin only

**A task can only link to a `PROPOSED` or `ACTIVE` project**, not `COMPLETED`/`ARCHIVED` — both `POST` and `PATCH` validate this (`lib/projects.ts`'s `TASK_LINKABLE_PROJECT_STATUSES`), returning `400` otherwise. This was an explicit decision point flagged and confirmed by the user (the original ask used "Approved"/"In Progress," which don't exist as statuses on this schema — see `11-project-proposals.md`'s Implementation Notes).

Every create/update/delete enqueues the Google Calendar sync job (`lib/sync-calendar.ts`) — see `10-calendar.md`'s Google Calendar Sync section.

## Page

Create `app/(app)/tasks/page.tsx`.

- shadcn `Tabs`: "My Tasks" / "All Tasks"
- board or list view grouped by status (`TODO`, `IN_PROGRESS`, `DONE`)
- each task card: title, due date+time, task type tag, assignee avatars (shadcn `Avatar`), status badge — a colored left accent strip matches the task's status (see `ui-context.md`'s Cards/widgets note), and column headers use the eyebrow label style, not the generated muted default
- "New Task" button opens a `Dialog`: title (required), task type (required, select from the `FunctionalRole` list), description (optional), Start and End (both required, each full-width — not squeezed into a two-column row, since a date+time field needs the room), assignee picker (multi-select from the member roster), **Project** (optional select — "Not part of a project / Standalone" plus every `PROPOSED`/`ACTIVE` project, per the linkability rule above), **Related Document(s)** (optional multi-select checklist of every `Doc`, sorted so docs already belonging to the selected project surface first — not a hard filter, since a task can reasonably reference a doc from outside its own project too).
- **date/time fields use `components/shared/date-time-picker.tsx`**, never a bare native date input (see `ui-context.md`'s Contrast rule for why) — a custom Dialog with its own month grid and an explicit **Select** button. The time portion is three dropdown `Select`s (hour 1–12, minute in 5-minute steps, AM/PM), not a native `<input type="time">`, so it's consistent with the rest of the picker rather than mixing custom and native controls.
- **assignees must be explicit, never implied by leaving the field blank.** A **"Select All (whole team — group task)"** checkbox sits above the member checklist — checking it selects every member (functionally identical to a group-wide task, since the sync/audience logic already treats "assigned to everyone" and "assigned to none" the same way), and is the intended way to make a task group-wide rather than leaving the list empty. At least one assignee (a specific pick, or Select All) is required — the Create button stays disabled until it, along with every other required field, has a value; not just relying on native `required` attributes, since those only complain on submit
- clicking a task opens a detail `Dialog` to edit status, type, Start, End, assignees (same Select All control), description, Project, and Related Documents, plus a Delete option (creator or Admin only) — the same mandatory-field rules apply as creation
- **both the New Task and task detail dialogs live in their own components** (`components/tasks/new-task-dialog.tsx`, `components/tasks/task-detail-dialog.tsx`), not inlined in the board — `/calendar` reuses them (see `10-calendar.md`), though there it opens the detail dialog in **`readOnly`** mode (view the task, Delete if you're the creator/Admin, but no editable fields) — full editing stays on `/tasks`. Both dialogs, plus `task-board.tsx`'s card, now take `projects`/`docs` props (the pages fetch them: `/tasks` and `/calendar` both query `PROPOSED`/`ACTIVE` projects and the full doc list) alongside `members`.
- **a linked project shows as a small badge/chip** wherever a task is displayed — the board card (`FolderKanban` icon + project name, next to the type tag) and the read-only detail view (same chip, next to the status/type badges) — clicking it links to `/projects/[projectId]`. **Related documents show as a small linked list** (`FileText` icon + title) in the read-only detail view, each linking to `/docs/[docId]`.
- Auto-suggesting a project's assigned members as default task assignees, when a project is picked, was raised as a possible enhancement but explicitly deferred — not built in this pass.

## Check When Done

- tasks can be created, assigned to one or more members, and moved between statuses
- a task cannot be created or saved without a title, type, start date, and due date
- "My Tasks" only shows tasks assigned to the current member
- only the creator or an Admin can delete a task
- a task can link to a `PROPOSED`/`ACTIVE` project and zero or more docs; linking to a `COMPLETED`/`ARCHIVED` project is rejected
- a linked project shows as a clickable chip and linked documents as a clickable list, wherever a task's details are shown
- `npm run build` passes
