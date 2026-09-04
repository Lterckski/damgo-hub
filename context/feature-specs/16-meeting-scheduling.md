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
- `notificationRevision` — integer, defaults to `1`; increment transactionally whenever email-relevant meeting details or the participant list changes
- `reminder24hRunId` — optional Trigger.dev run ID for cancellation/rescheduling
- `reminder1hRunId` — optional Trigger.dev run ID for cancellation/rescheduling
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

Add `MeetingEmailDelivery` as a durable delivery/idempotency record:

- `id`
- `meetingId` — plain string rather than a relation so cancellation-delivery history survives meeting deletion
- `recipientMemberId` — plain string so delivery history does not block member deletion
- `notificationType` enum: `INVITATION`, `UPDATED`, `PARTICIPANT_REMOVED`, `MEETING_CANCELLED`, `REMINDER_24H`, `REMINDER_1H`
- `meetingRevision`
- `status` enum: `PENDING`, `SENDING`, `SENT`, `FAILED`, `SKIPPED`; use `SKIPPED` for permanent recipient problems such as a missing/invalid address
- `providerMessageId` — optional
- `attemptCount` — defaults to `0`
- `lastError` — optional sanitized provider error; never store API keys or full provider responses
- `sentAt` — optional
- timestamps
- unique constraint on `meetingId`/`recipientMemberId`/`notificationType`/`meetingRevision`

Add `MeetingNotificationOutbox` for immediate invitation/update/cancellation intent:

- store the meeting ID, notification type/revision, deduplicated recipient IDs, and immutable meeting snapshot
- `status` enum: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`
- attempt count, sanitized last error, processed timestamp, and timestamps
- write the outbox row in the same database transaction as the meeting create/update/delete
- enqueue its worker only after commit; a recurring Trigger.dev sweep re-enqueues pending/failed/stale-processing rows after an API-to-Trigger outage

`AgendaItem` records are the meeting's final agenda. Positions are contiguous, zero-based, and unique within the meeting. Adding an item or accepting a proposal appends it at the next position; removing one closes the gap; reordering rewrites all affected positions in one transaction. Queries sort by `position`, then `createdAt`, then `id` as a defensive stable fallback.

When the Leader or Assistant Leader accepts a pending proposal, update it to `ACCEPTED` and create its linked `AgendaItem` in the same transaction. Declining sets it to `DECLINED` without creating an item. A proposal that already has a linked agenda item cannot be accepted again. Agenda records remain ordinary PostgreSQL rows and never seed a collaborative board.

### Member deletion policy

The existing Admin member-deletion transaction must handle meeting relations before deleting the member:

- Reassign meetings organized by the deleted member to the acting Admin, and ensure that Admin has a deduplicated `MeetingParticipant` row for each reassigned meeting.
- Reassign agenda proposals authored by the deleted member and agenda items added by them to the acting Admin so meeting content is preserved.
- Delete the member's `MeetingParticipant` rows through the cascade relation.

The `Restrict` relations intentionally prevent deleting a member without this reassignment. This follows the app's existing policy of preserving member-created organizational content under the acting Admin rather than silently deleting it.

`MeetingEmailDelivery.recipientMemberId` is intentionally not reassigned or deleted. It is immutable delivery history, not current ownership, and must retain the original recipient identifier for auditing and duplicate prevention.

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

## Email Notifications

Meeting email is a real delivery channel, not an in-app notification placeholder, and is implemented as part of this unit rather than deferred until unit `21`. Reuse the existing Trigger.dev setup; meeting request handlers enqueue or schedule work and never call Resend inline.

Implementation:

- Install the official `resend` package.
- Add server-only `RESEND_API_KEY`, `MEETING_EMAIL_FROM`, and canonical production `APP_URL` variables to `.env.example` and Vercel.
- Create `lib/email.ts` as the typed, server-only Resend wrapper.
- Create a reusable escaped meeting email template for invitations, updates, participant/meeting cancellations, and reminders.
- Create `src/trigger/meeting-notification.ts` for immediate emails and `src/trigger/meeting-reminder.ts` for delayed 24-hour/1-hour reminders. Unit `21-scheduled-reminders.md` reuses these instead of creating a second meeting-notification system.

Send one email per recipient—never expose the participant list through a shared `To` or `CC` header:

- **Invitation:** send immediately when a member is first added as a participant, including when the meeting is created.
- **Updated meeting:** send to participants who remain on the meeting when the title, start/end time, location, or external meeting URL changes. In a request that also changes participants, newly added members receive only the invitation and removed members receive only the cancellation. Do not email for agenda-only changes.
- **Participant removed:** send a cancellation notice only to a member removed from the participant list.
- **Meeting cancelled:** send a cancellation notice to every current participant when the meeting is deleted.
- **Reminders:** schedule participant emails 24 hours and 1 hour before `scheduledAt`. If either reminder time has already passed when the meeting is created or rescheduled, skip that occurrence instead of sending it late.

Every invitation, update, and reminder includes:

- meeting title and optional description
- start time, optional end time, and an explicit timezone label
- organizer name
- physical location and/or external meeting link when present
- a link to `/meetings/[meetingId]` in Damgo Hub, where the participant can view the current final agenda

Email behavior:

- Use each participant's stored `Member.email`; skip missing/invalid addresses and log a structured delivery error without failing the meeting mutation.
- Deduplicate recipient member IDs before enqueueing.
- Persist immediate-notification intent in `MeetingNotificationOutbox` before enqueueing so a Trigger.dev outage cannot lose an invitation, update, removal, or cancellation.
- Before sending, claim the unique `MeetingEmailDelivery` row for the meeting, recipient, notification type, and meeting revision. Skip rows already marked `SENT`; retry only a definitively `FAILED` attempt. Keep an ambiguous interrupted `SENDING` attempt for manual reconciliation rather than risking a duplicate. Use the same composite value as Resend's idempotency key as a secondary short-window safeguard, but rely on the database row for durable deduplication.
- Treat missing/invalid recipient addresses as permanent `SKIPPED` deliveries; they must not fail or repeatedly retry the whole Trigger.dev task.
- Treat meeting titles, descriptions, locations, and organizer names as untrusted text and escape them through the email template rather than interpolating raw HTML.
- Creating/updating a meeting schedules new reminder runs and cancels any still-pending reminder runs for the previous schedule. Deleting the meeting cancels pending reminders.
- Provider failures use Trigger.dev retries and are visible in task logs; they do not roll back an already-valid meeting mutation.
- Do not send email to non-participants merely because they are an Admin. The Leader or Assistant Leader receives meeting email only when they are also a participant.

External setup required before delivery can work:

- Create a Resend account and verify the sending domain.
- Create an API key and configure `RESEND_API_KEY` locally and in Vercel.
- Configure `MEETING_EMAIL_FROM` with an address on the verified domain.
- Configure `APP_URL` with the canonical production origin so email links never point to a preview deployment.

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
- Do not send email inline from API routes or client components

## Check When Done

- Meetings can be scheduled with participants and an optional physical location or external meeting link.
- Upcoming and past meetings are listed correctly.
- Visible meetings appear on the shared calendar with their optional end time; inaccessible meetings are not leaked.
- New participants receive one invitation email; removed participants and participants of a deleted meeting receive the appropriate cancellation email.
- Meeting schedule/detail changes notify current participants, and 24-hour/1-hour reminders are rescheduled without duplicate delivery.
- Participants can propose agenda items.
- Regular members cannot directly add, edit, reorder, or remove final agenda items.
- Only the Leader and Assistant Leader can accept/decline proposals and add, edit, reorder, or remove final agenda items.
- The organizer alone can edit/delete meeting details, independently of agenda-curation permissions.
- Accepted proposals create linked agenda items, and the final agenda renders in deterministic order.
- Non-participants and non-Admins cannot view a meeting detail page.
- No Liveblocks or in-app meeting experience is initialized from meeting pages.
- `npm run build` passes.
