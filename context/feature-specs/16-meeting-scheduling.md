# Meetings: Scheduling and Agenda Planning

## Goal

Build a place for members to schedule meetings, invite participants, and prepare an ordered agenda before the meeting starts.

Damgo Hub does **not** host the meeting itself. The actual meeting happens in person or through an external service such as Google Meet, Zoom, or Microsoft Teams. This feature must not add video, audio, screen sharing, recording, live meeting notes, a Liveblocks room, or a React Flow agenda board.

## Schema

Create `prisma/models/meeting.prisma`.

Add `Meeting`:

- `id`
- `title`
- `description` — optional context or purpose
- `scheduledAt`
- `endsAt` — optional
- `location` — optional physical location
- `meetingUrl` — optional external meeting link
- `organizerId` — relation to `Member`, `onDelete: Restrict`
- timestamps
- index on `scheduledAt`

Add `MeetingParticipant`:

- `meetingId` relation, cascade delete
- `memberId` relation, cascade delete
- unique constraint on `meetingId`/`memberId`

Add `AgendaProposal`:

- `id`
- `meetingId` relation, cascade delete
- `proposedById` — relation to `Member`, `onDelete: Restrict`
- `text`
- `status` enum: `PENDING`, `ACCEPTED`, `DECLINED` — defaults to `PENDING`
- `position` — optional integer; required for `ACCEPTED` items and `null` otherwise
- timestamps
- unique constraint on `meetingId`/`position` (PostgreSQL permits multiple `null` values)

Accepted proposals are the meeting's final agenda. Accepted positions are contiguous, zero-based, and unique within the meeting. Accepting an item appends it at the next position; declining an accepted item clears its position and closes the gap; reordering rewrites all affected positions in one transaction. Queries sort accepted items by `position`, then `createdAt`, then `id` as a defensive stable fallback. They remain ordinary PostgreSQL records and do not seed a separate collaborative board.

### Member deletion policy

The existing Admin member-deletion transaction must handle meeting relations before deleting the member:

- Reassign meetings organized by the deleted member to the acting Admin, and ensure that Admin has a deduplicated `MeetingParticipant` row for each reassigned meeting.
- Reassign agenda proposals authored by the deleted member to the acting Admin so accepted and pending agenda content is preserved.
- Delete the member's `MeetingParticipant` rows through the cascade relation.

The `Restrict` relations intentionally prevent deleting a member without this reassignment. This follows the app's existing policy of preserving member-created organizational content under the acting Admin rather than silently deleting it.

## Permissions

- Any authenticated member can schedule a meeting and becomes its organizer.
- The organizer chooses the participants and is automatically included as a participant.
- A participant or an Admin can view the meeting detail page.
- Any participant can propose an agenda item.
- Only the organizer can edit the meeting, manage participants, accept or decline proposals, and reorder the accepted agenda.
- Admin access allows oversight and viewing; it does not silently grant organizer mutation rights.

## Routes

Create REST endpoints under `app/api/meetings`:

- `GET /api/meetings` — list meetings visible to the current member; support `?upcoming=true`
- `POST /api/meetings` — schedule a meeting; accepts meeting details and an initial participant list
- `GET /api/meetings/[meetingId]` — requires participation or Admin
- `PATCH /api/meetings/[meetingId]` — organizer only; edits details and participants. Normalize submitted participant IDs server-side by deduplicating them and always including `organizerId` before replacing participant rows.
- `DELETE /api/meetings/[meetingId]` — organizer only
- `POST /api/meetings/[meetingId]/agenda-proposals` — any participant can propose an item
- `PATCH /api/meetings/[meetingId]/agenda-proposals/[proposalId]` — organizer only; accept, decline, edit, or change an accepted item's position

Validate that `endsAt`, when provided, is later than `scheduledAt`. Validate `meetingUrl` as an `http` or `https` URL.

## Calendar Integration

Meetings appear in the existing organization calendar without duplicating them into `CalendarEvent`:

- Extend `GET /api/calendar/events` to include meetings visible to the caller: meetings where they are a participant, or all meetings when they are an Admin.
- Map `Meeting.id`, `title`, `scheduledAt`, and `endsAt` to the unified calendar shape as `{ id, title, type: "meeting", startAt: scheduledAt, endAt: endsAt }`.
- Apply the calendar route's existing overlap-based `?from=&to=` range filtering to the complete meeting interval. A missing `endsAt` is a single-point item.
- Meeting create, edit, and delete UI refreshes the relevant server data so the meetings list, meeting detail, dashboard, and calendar reflect the mutation without a manual reload.
- Clicking a meeting in the calendar navigates to `/meetings/[meetingId]`; the detail page still enforces participant/Admin access.
- Google Calendar synchronization for meetings is not part of this unit; it remains limited to tasks and standalone calendar events unless a later requirement explicitly adds meetings.

## Pages

Create `app/(app)/meetings/page.tsx` and `app/(app)/meetings/[meetingId]/page.tsx`.

### Meetings list

- Upcoming and Past tabs
- Cards showing title, date/time, organizer, optional location or external-service label, and participant avatar stack
- "Schedule Meeting" dialog with title, description, start, optional end, optional location, optional external meeting link, and participant multi-select
- Upcoming meetings expose a clear "Join external meeting" action only when `meetingUrl` is present

### Meeting detail

- Header with title, description, date/time, organizer, participants, and optional location/external meeting link
- Organizer-only Edit and Delete actions
- "Proposed items" section where participants submit agenda suggestions and can see each proposal's status
- Organizer-only Accept and Decline actions for pending proposals
- "Final agenda" section containing accepted proposals in `position` order
- Organizer controls to move accepted items up or down
- Helpful empty states when no proposals or accepted agenda items exist

The detail page is an asynchronous planning page, not a live meeting workspace. It must not include a "Live Agenda" tab or initialize Liveblocks.

## Scope Limits

- No built-in video or audio calls
- No screen sharing, recording, or streaming
- No live cursors, presence avatars, React Flow canvas, or Liveblocks room
- No collaborative meeting notes or quote capture
- No attendance tracking in this unit
- Do not implement `17-meeting-agenda-board.md`; that unit is retired by this product decision

## Check When Done

- Meetings can be scheduled with participants and an optional physical location or external meeting link.
- Upcoming and past meetings are listed correctly.
- Visible meetings appear on the shared calendar with their optional end time; inaccessible meetings are not leaked.
- Participants can propose agenda items.
- Only the organizer can accept, decline, and reorder agenda items or edit/delete the meeting.
- Accepted proposals render as the ordered final agenda.
- Non-participants and non-Admins cannot view a meeting detail page.
- No Liveblocks or in-app meeting experience is initialized from meeting pages.
- `npm run build` passes.
