# Meetings: Scheduling and Agenda Planning

## Goal

Build a place for members to schedule meetings, invite participants, and propose agenda topics before the meeting starts. Only the Leader and Assistant Leader may turn proposals into the final agenda or add agenda items directly.

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
- timestamps

Add `AgendaItem`:

- `id`
- `meetingId` relation, cascade delete
- `text`
- `position` — required integer
- `addedById` — relation to `Member`, `onDelete: Restrict`; always the Leader or Assistant Leader who added/accepted it
- `sourceProposalId` — optional unique relation to `AgendaProposal`, `onDelete: SetNull`
- timestamps
- unique constraint on `meetingId`/`position`

`AgendaItem` records are the meeting's final agenda. Positions are contiguous, zero-based, and unique within the meeting. Adding an item or accepting a proposal appends it at the next position; removing one closes the gap; reordering rewrites all affected positions in one transaction. Queries sort by `position`, then `createdAt`, then `id` as a defensive stable fallback.

When the Leader or Assistant Leader accepts a pending proposal, update it to `ACCEPTED` and create its linked `AgendaItem` in the same transaction. Declining sets it to `DECLINED` without creating an item. A proposal that already has a linked agenda item cannot be accepted again. Agenda records remain ordinary PostgreSQL rows and never seed a collaborative board.

### Member deletion policy

The existing Admin member-deletion transaction must handle meeting relations before deleting the member:

- Reassign meetings organized by the deleted member to the acting Admin, and ensure that Admin has a deduplicated `MeetingParticipant` row for each reassigned meeting.
- Reassign agenda proposals authored by the deleted member and agenda items added by them to the acting Admin so meeting content is preserved.
- Delete the member's `MeetingParticipant` rows through the cascade relation.

The `Restrict` relations intentionally prevent deleting a member without this reassignment. This follows the app's existing policy of preserving member-created organizational content under the acting Admin rather than silently deleting it.

## Permissions

- Any authenticated member can schedule a meeting and becomes its organizer.
- The organizer chooses the participants and is automatically included as a participant.
- A participant or an Admin can view the meeting detail page.
- Any participant can submit a `PENDING` agenda proposal. Members cannot set its status or position and cannot add directly to the final agenda.
- Only `org:admin` members—the Leader and Assistant Leader—can add final agenda items directly, accept or decline proposals, and edit, reorder, or remove final agenda items.
- The organizer can edit the meeting details and manage participants, but receives no agenda-curation permission unless they are also the Leader or Assistant Leader.
- Admin agenda authority does not grant permission to edit or delete another organizer's meeting details.

## Routes

Create REST endpoints under `app/api/meetings`:

- `GET /api/meetings` — list meetings visible to the current member; support `?upcoming=true`
- `POST /api/meetings` — schedule a meeting; accepts meeting details and an initial participant list
- `GET /api/meetings/[meetingId]` — requires participation or Admin
- `PATCH /api/meetings/[meetingId]` — organizer only; edits details and participants. Normalize submitted participant IDs server-side by deduplicating them and always including `organizerId` before replacing participant rows.
- `DELETE /api/meetings/[meetingId]` — organizer only
- `POST /api/meetings/[meetingId]/agenda-proposals` — any participant can propose an item; always creates `PENDING` and ignores/rejects client-supplied status or position fields
- `PATCH /api/meetings/[meetingId]/agenda-proposals/[proposalId]` — Leader or Assistant Leader only; accept or decline a pending proposal
- `POST /api/meetings/[meetingId]/agenda-items` — Leader or Assistant Leader only; add an item directly to the end of the final agenda
- `PATCH /api/meetings/[meetingId]/agenda-items/[agendaItemId]` — Leader or Assistant Leader only; edit text or move an item to a validated position
- `DELETE /api/meetings/[meetingId]/agenda-items/[agendaItemId]` — Leader or Assistant Leader only; delete the item and compact the remaining positions transactionally. If it came from a proposal, set that proposal to `DECLINED` in the same transaction so `ACCEPTED` always means present on the final agenda.

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
- Leader/Assistant Leader-only Accept and Decline actions for pending proposals
- "Final agenda" section containing `AgendaItem` records in `position` order
- Leader/Assistant Leader-only Add Agenda Item, Edit, Remove, Move Up, and Move Down controls
- Regular members see the final agenda as read-only and only receive the proposal form
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
- Regular members cannot directly add, edit, reorder, or remove final agenda items.
- Only the Leader and Assistant Leader can accept/decline proposals and add, edit, reorder, or remove final agenda items.
- The organizer alone can edit/delete meeting details, independently of agenda-curation permissions.
- Accepted proposals create linked agenda items, and the final agenda renders in deterministic order.
- Non-participants and non-Admins cannot view a meeting detail page.
- No Liveblocks or in-app meeting experience is initialized from meeting pages.
- `npm run build` passes.
