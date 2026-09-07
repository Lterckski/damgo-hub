# Calendar

## Goal

Build the shared organization calendar: schema, API, and UI, in one unit. This unit only covers standalone calendar events — meeting and task due dates are surfaced on the calendar automatically once `16-meeting-scheduling.md` and `08-task-assignment.md` exist, by reading from those tables, not by duplicating data into `CalendarEvent`.

## Schema

Create `prisma/models/calendar-event.prisma`.

Add `CalendarEvent`:

- `id`
- `title`
- `description` — optional
- `startAt`
- `endAt` — optional
- `createdById` — relation to `Member`
- timestamps
- index on `startAt`

## Routes

Create REST endpoints under `app/api/calendar`:

- `GET /api/calendar/events` — support `?from=&to=` range filters; returns `CalendarEvent` rows merged with visible meeting dates and task date ranges into one unified shape (`{ id, title, type: "event" | "meeting" | "task", startAt, endAt }`) — `endAt` makes a span explicit (a task's `startDate` → `dueDate`, a meeting's `scheduledAt` → optional `endsAt`, or an event's own `endAt`); `null`/equal to `startAt` means a single-point item. Only meetings where the caller is a participant are included, unless the caller is an Admin. The range filter matches on *overlap* with `?from=&to=`, not just whether the start falls inside it.
- `POST /api/calendar/events` — create a standalone event
- `PATCH /api/calendar/events/[eventId]` — creator or Admin only
- `DELETE /api/calendar/events/[eventId]` — creator or Admin only

Tasks are already merged into this route. When `16-meeting-scheduling.md` lands, add its access-filtered meeting query directly to the same response; do not create duplicate `CalendarEvent` rows. Meeting mutations refresh the server-rendered calendar data, and clicking a meeting navigates to its access-controlled detail page. Google Calendar synchronization remains limited to tasks and standalone `CalendarEvent` records in this unit.

## Page

Create `app/(app)/calendar/page.tsx`.

- **a custom month grid, not shadcn's `Calendar`** (that component is a compact date-picker built on `react-day-picker` — too small to show item content inside a cell, which this needs). `components/calendar/calendar-view.tsx` builds the grid directly with `date-fns` (`startOfMonth`/`endOfWeek`/`eachDayOfInterval`, etc.): 7 columns, one row per week, prev/next-month/Today controls. The grid takes half the page width; each week's height comes from a compact `min-h-24` on its day cells (room for the day number plus a couple of item bars), not a fixed/viewport-clamped container — deliberately smaller than an earlier `min-h-28` pass, which the user called out as oversized ("big ass calendar").
- **the grid and the agenda share the page's normal scroll — neither has its own inner scroll container** — but the grid is **`sticky top-4`** within that shared scroll, so it stays in view (up to its own column's height) while the agenda scrolls past it, rather than scrolling fully out of frame the moment the agenda gets taller than the grid. An earlier version fixed the whole `CalendarView` to a viewport-height clamp with the agenda scrolling independently inside it — that made scrolling the agenda leave the calendar sitting still (the opposite complaint); removing that isolated `overflow-y-auto` container fixed it, and `sticky` is what keeps the now-shorter grid gracefully in frame rather than disappearing.
- items that span two or more days (a task's `startDate` → `dueDate`, or a multi-day event) render as **one continuous horizontal bar across every day they cover** — Google Calendar-style, not a separate chip repeated on each day. Bars are stacked into lanes via a standard greedy interval-scheduling assignment (`assignLanes` in `calendar-view.tsx`), computed once across the whole visible month so a bar spanning multiple weeks keeps the same lane on every row instead of jumping around; a bar continuing into an adjacent week keeps a square (non-rounded) edge on that side as a continuation cue, rounded where it actually starts/ends. Single-day items use the same bar system (span of one day) rather than a separate chip renderer, so the two never look inconsistent. Each week caps at a few visible lanes; a day covered by more bars than fit shows a "+N more" count at the bottom of its column.
- **the other half of the page is a 5-day agenda, not just the selected day** — a hard date window (today + the next `AGENDA_WINDOW_DAYS`, currently 5), not a count of populated days — so it never shows more than 5 days out regardless of how much or little is scheduled. Each day with at least one item gets a date header and its items below; an empty day in the window just doesn't get a section. A multi-day item repeats under every day it spans within that window, schedule-view style. Clicking a day in the grid still highlights it there, but the agenda isn't filtered down to just that one day.
- **clicking any item — event, meeting, or task, in the grid or the agenda — opens its appropriate detail experience**, not just events. An event opens `EventDetailDialog` (edit/delete for the creator or an Admin); a meeting navigates to `/meetings/[meetingId]`, where participant/Admin access is checked again; a task opens the same `TaskDetailDialog` `/tasks` uses (`components/tasks/task-detail-dialog.tsx`, shared between both pages), but here in **`readOnly`** mode — view the task (status, type, dates, description, assignees) and Delete it if you're the creator/Admin, but no editable fields. Full editing stays on `/tasks`; clicking a task from the calendar is for checking what it is, not changing it.
- **both "New Event" and "New Task" live on `/calendar`**, not just `/tasks` — `NewEventDialog` and `NewTaskDialog` (`components/tasks/new-task-dialog.tsx`, the same component `/tasks` uses) sit side by side above the agenda. The page fetches the full task list + member roster (not just the merged calendar `items`) so these shared dialogs have what they need.

## Google Calendar Sync

Meetings are a third synced source as of 2026-09-08 — see [16-meeting-scheduling.md](16-meeting-scheduling.md). They sync to their participants only, unlike tasks and calendar events, which fan out to the whole team when they are group-wide.

Task deadlines and calendar events also sync out to each member's own Google Calendar — added per the user's explicit request. Two decisions drive the design, both made by the user directly (not defaults):

- **Group items go to *everyone's own* calendar**, not one shared team calendar. A task with no assignees, and every `CalendarEvent` (which has no individual-assignment concept at all — see the Goal above), is "group-wide": it gets pushed as a separate copy onto each member's own Google Calendar. A task *with* assignees only syncs to those members' calendars.
- **Sync is automatic, not opt-in.** There's no toggle in the app. Once a member has signed in with Google through Clerk (or links it later via Clerk's account portal) with the right scope granted, their assigned/group items start syncing on their own. A member who hasn't connected Google is silently skipped — not an error, just nothing to sync to yet.

### One-time setup (external, not app code)

Google Calendar access rides on Clerk's existing Google social connection rather than a separate OAuth flow we'd have to build and maintain ourselves:

1. **Google Cloud Console**: create/select a project, enable the **Google Calendar API**, and configure the OAuth consent screen.
2. Create an **OAuth 2.0 Client ID** (Web application), with Clerk's redirect URI (shown in the Clerk Dashboard) whitelisted.
3. **Clerk Dashboard → User & Authentication → Social Connections → Google**: enable it, switch to "Use custom credentials," paste the Client ID/Secret from step 2, and add the scope `https://www.googleapis.com/auth/calendar.events` under additional/custom scopes.
4. Each member needs to have signed in with Google (or connected it via Clerk's account portal, reachable from the `UserButton` menu) for sync to work for them — no custom UI needed for that step, Clerk's hosted account portal already handles "connect an additional account" once Google is enabled.

None of this can be done by an agent — it needs a real Google Cloud project and Clerk Dashboard access. Until it's done, the sync code runs but every member resolves to "no Google token," so it silently no-ops.

### Schema

Create `prisma/models/google-calendar-sync.prisma`. Add `GoogleCalendarSyncedEvent` — one row per (member, source item), since a group item becomes a separate remote event per member:

- `id`
- `memberId` — relation to `Member`, cascade delete
- `sourceType` enum: `TASK`, `CALENDAR_EVENT`
- `sourceId` — the `Task.id` or `CalendarEvent.id` (not a formal relation, since it points at either model depending on `sourceType`)
- `googleEventId` — the event id Google assigned in that member's own calendar; needed to `PATCH`/`DELETE` the right remote event later
- timestamps
- unique on `[memberId, sourceType, sourceId]`; index on `[sourceType, sourceId]`

### Sync mechanics

- `lib/google-oauth-token.ts` — `getMemberGoogleAccessToken(clerkUserId)`, wraps Clerk's `getUserOauthAccessToken(userId, "google")`; returns `null` (not a throw) when the member has no Google connection.
- `lib/google-calendar.ts` — thin `fetch`-based wrapper around the Google Calendar REST API's `events.insert`/`update`/`delete` on the member's `primary` calendar. Deliberately not the `googleapis` SDK — this is simple enough not to justify the dependency.
- `src/trigger/sync-calendar-item.ts` — a Trigger.dev task, `sync-calendar-item-to-google`, taking `{ sourceType, sourceId }`. Looks up the source row, resolves its target member(s) (per the audience rule above), and for each one with a Google token, creates/updates/deletes the corresponding `GoogleCalendarSyncedEvent`-tracked remote event. This is a background job, never run inline in a request handler, per `architecture-context.md` invariant 1 — it makes one external API call per target member and a group-wide event can have several. For a `Task`, the synced Google event spans the task's actual `startDate` → `dueDate` (both mandatory per `08-task-assignment.md`), not a single-point-in-time event.
- `lib/sync-calendar.ts` — `enqueueGoogleCalendarSync(sourceType, sourceId)`, called from `app/api/tasks/*` and `app/api/calendar/events/*` after any create/update/delete. A failure to enqueue never fails the mutation itself — this is a background enhancement, not a correctness requirement.

## Check When Done

- calendar renders a full-height, half-page-width month grid with items shown directly inside each day cell, not just marked with a dot
- events can be created, edited, and deleted by their creator or an Admin
- creating/updating/deleting a `CalendarEvent` or a `Task` with a due date enqueues the Google Calendar sync job; a member with no connected Google account is skipped without error
- a group-wide item (no assignees) syncs to every member; an assigned task syncs only to its assignees
- `npm run build` passes
