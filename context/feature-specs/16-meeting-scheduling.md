# Meetings: Scheduling and Agenda Planning

## Goal

Build a place where Admins schedule meetings and invite participants, and participants propose agenda topics before the meeting starts (see Scheduling Permission — scheduling was originally open to any member). Only the Leader and Assistant Leader may turn proposals into the final agenda or add agenda items directly.

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
- `status` enum: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `DEAD_LETTER`
- attempt count, sanitized last error, processed timestamp, and timestamps
- write the outbox row in the same database transaction as the meeting create/update/delete
- enqueue its worker only after commit; a recurring Trigger.dev sweep re-enqueues pending/failed/stale-processing rows after an API-to-Trigger outage, with a bounded retry count before `DEAD_LETTER`

`AgendaItem` records are the meeting's final agenda. Positions are contiguous, zero-based, and unique within the meeting. Adding an item or accepting a proposal appends it at the next position; removing one closes the gap; reordering rewrites all affected positions in one transaction. Queries sort by `position`, then `createdAt`, then `id` as a defensive stable fallback.

When the Leader or Assistant Leader accepts a pending proposal, update it to `ACCEPTED` and create its linked `AgendaItem` in the same transaction. Declining sets it to `DECLINED` without creating an item. A proposal that already has a linked agenda item cannot be accepted again. Agenda records remain ordinary PostgreSQL rows and never seed a collaborative board.

### Member deletion policy

The existing Admin member-deletion transaction must handle meeting relations before deleting the member:

- Reassign meetings organized by the deleted member to the acting Admin, and ensure that Admin has a deduplicated `MeetingParticipant` row for each reassigned meeting.
- Reassign agenda proposals authored by the deleted member and agenda items added by them to the acting Admin so meeting content is preserved.
- Delete the member's `MeetingParticipant` rows through the cascade relation.

The `Restrict` relations intentionally prevent deleting a member without this reassignment. This follows the app's existing policy of preserving member-created organizational content under the acting Admin rather than silently deleting it.

`MeetingEmailDelivery.recipientMemberId` is intentionally not reassigned or deleted. It is immutable delivery history, not current ownership, and must retain the original recipient identifier for auditing and duplicate prevention.

## Scheduling Permission

Requirement recorded 2026-09-07. Scheduling a meeting is an Admin action. This **supersedes** the "any authenticated member can schedule a meeting" rule in Permissions below; everything else about the meeting model — organizer ownership of the record, participant agenda proposals, and Leader/Assistant Leader agenda curation — is unchanged.

- Only members holding the Clerk `org:admin` role may create, reschedule, edit, or delete a meeting, or change its participant list. Per [team-roster.md](../team-roster.md) that is the Leader and the Assistant Leader; per [architecture-context.md](../architecture-context.md#org-role-clerk-native-binary) `org:admin` is granted only through the Leader-gated "Assign Assistant Leader" flow. Meeting scheduling introduces no new role and no per-meeting permission of its own.
- `org:member` keeps read access to the meetings already visible to them and gains no write path: no create, edit, reschedule, delete, or participant management, in the UI or through the API. (Whether member read access widens beyond today's participant-or-admin rule is unresolved — see Open Questions.)
- Agenda behavior is unaffected. Any participant may still submit a `PENDING` agenda proposal, and only `org:admin` may accept or decline proposals and add, edit, reorder, or remove final agenda items.
- The organizer is now always an `org:admin`. Keep `organizerId` and the organizer-only detail rules as written — they narrow *which* admin owns a record, they do not replace the role check.
- Enforcement is server-side, in the `app/api/meetings` route handlers and any server action reaching the same mutations, on the parsed request, before any write, outbox row, or reminder is scheduled. Hiding the "Schedule Meeting" control is presentation only and never the check — [architecture invariant 3](../architecture-context.md#invariants).
- The Meetings list dialog's non-admin fallback becomes unreachable: the disabled "Propose an agenda" stand-in described under Pages exists for a member who can open the Schedule Meeting dialog, and no member can. Remove it rather than leaving a dialog path that implies a member can schedule. **Done** — the stand-in and the dialog's `isAdmin` prop are both gone, since everyone who can open it is an admin.

### Acceptance Criteria

- `POST /api/meetings` returns `403` for an authenticated `org:member` and `401` when signed out. The rejected request writes no `Meeting`, `MeetingParticipant`, `MeetingNotificationOutbox`, or `MeetingEmailDelivery` row and schedules no reminder run.
- `PATCH /api/meetings/[meetingId]` and `DELETE /api/meetings/[meetingId]` return `403` for an `org:member`, including one who is a participant of that meeting.
- The role is re-read from Clerk per request. A member demoted from `org:admin` loses meeting-write access on their next request without needing a new session, and no cached `Member` field is consulted for the decision.
- A request replayed or hand-crafted from a non-admin account is refused at the mutation boundary, not merely absent from that account's UI.
- The dev "View as Member" toggle refuses meeting mutations while active, the same way `requireAdmin()` already behaves for admin routes — so the toggle demonstrates a server denial, not a hidden button.
- `GET /api/meetings` and `GET /api/meetings/[meetingId]` return exactly what they returned before this change for a member; no meeting data is newly exposed or newly hidden by it.
- On `/meetings`, the meeting detail page, the calendar, dashboard widgets, and search results, a member sees no create, edit, reschedule, delete, or participant-management control — and removing those controls is not the only thing preventing the write.
- Existing meeting email behavior is unchanged: invitations, updates, cancellations, and 24-hour/1-hour reminders still go to participants regardless of role, and an admin receives meeting email only when they are a participant.

## Permissions

- ~~Any authenticated member can schedule a meeting and becomes its organizer.~~ Superseded by Scheduling Permission above: only `org:admin` can schedule, and the scheduling admin becomes the organizer.
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
- **Google Calendar synchronization for meetings is now in scope (2026-09-08).** The original deferral ("unless a later requirement explicitly adds meetings") has been taken up:
  - A meeting's schedule is pushed to **each participant's own Google Calendar**, reusing the existing `sync-calendar-item-to-google` Trigger.dev job and `GoogleCalendarSyncedEvent` mapping rather than a second mechanism. `SyncedEventSourceType` gains `MEETING` (migration `20260908090000_sync_meetings_to_google_calendar`).
  - Audience is the participant list — not the whole org — matching who can see the meeting and who receives its email.
  - The synced event runs `scheduledAt` → `endsAt`; a meeting with no `endsAt` is a single point in time, the same fallback tasks and events already use.
  - The Google event's description carries the meeting description, then `Location:` and `Join:` lines when set, so the calendar entry alone says where to be.
  - Create, edit/reschedule and delete all re-enqueue the job: it re-upserts for current participants and deletes the copy belonging to anyone removed from the list. Deleting the meeting removes every copy.
  - Enqueued **after** the database commit, and a failure never fails the mutation — this is a background enhancement, the same rule `10-calendar.md` set for tasks and events. It is also enqueued outside the notification-outbox `try`, so a failed email enqueue cannot silently skip the calendar.
  - Meetings scheduled **before** this change have no synced copy, since the job only runs on create/edit/delete. `scripts/backfill-meeting-calendar-sync.ts` enqueues it for existing meetings (upcoming only by default, `--all` for past ones, dry run unless `--apply`). It deliberately touches only the calendar job, so it sends no "meeting updated" email the way editing the meeting would. Safe to re-run: the job upserts by (member, sourceType, sourceId).
  - It depends on the same external setup as the rest of the sync (Google Cloud project, Clerk Google connection with `calendar.events`); a member who has not connected Google is skipped silently, never an error.

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
- the current ordered final agenda inline in both the HTML and plain-text email; show a clear empty-agenda note when none exists yet

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
- "Schedule Meeting" dialog with title, description, a **separate required meeting date and meeting time** (two distinct fields, not one combined start picker — no end date/end time field in this dialog at all; `Meeting.endsAt` still exists in the schema and still renders read-only wherever an existing meeting already has one, purely for backward compatibility with records created before this UI change), optional location, optional external meeting link, and participant multi-select
- The dialog also includes an inline "Add an agenda" agenda-item builder (Leader/Assistant Leader only — a non-admin sees a disabled "Propose an agenda" stand-in instead, since a real proposal needs an existing meeting to attach to and none exists yet at this point in the flow); items submitted here are added directly to the final agenda, in the order entered, the same as `POST /agenda-items` — enforced server-side, not just by hiding the button
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
- A meeting's date/time appears on each participant's own Google Calendar, updates when it is rescheduled or retitled, and disappears when they are removed from the meeting or the meeting is cancelled.
- Only `org:admin` members can create, edit, reschedule, or delete a meeting, enforced server-side; every Scheduling Permission acceptance criterion above passes.
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

## Open Questions

Recorded 2026-09-07 with the Scheduling Permission requirement, then implemented the same day on the user's instruction to build all four requirements without waiting for answers. Each entry records the assumption that was coded. **The user has not decided these** — changing one is a code change.

- **Does member read access widen?** *Built as (a) — no visibility change at all.* "Members have read access to scheduled meetings" reads either as (a) keep today's rule — a member sees a meeting only when they are a participant (`lib/meetings.ts`'s `meetingVisibilityWhere`: participants or admin) — or (b) every member can read every scheduled meeting. (b) is a visibility change that reaches the meetings list, detail page, calendar merge, and unit 23's search and notification grants, so it is not something to infer.
- **What happens to meetings a member already created?** *Left as they are: the organizer is unchanged, but organizer-only editing was replaced by admin-only editing, so a member organizer can no longer edit their own meeting and an admin can.* Any existing meeting with a member as `organizerId` still has an organizer-only edit and delete path, which this requirement is meant to remove. Leave them as they are, or reassign their organizer to an admin?
- **Who may edit a meeting the other admin created?** *Built as: any admin may edit or cancel any meeting. This is what makes the legacy member-organized meetings fixable.* Today details are organizer-only and the agenda is admin-only. With both admins able to schedule, should either admin be able to edit or cancel any meeting, or does organizer-only still apply between the Leader and the Assistant Leader?
- **May an admin schedule a meeting they are not part of?** *Left unchanged — the organizer is still auto-added as a participant, so no.* The organizer is currently auto-added as a participant. Should an admin be able to schedule for others and exclude themselves, and if so do they still receive the invitation and reminder email?
- **Does the Leader/Assistant Leader distinction matter here?** *Built on `org:admin` alone; the Assistant Leader has exactly the Leader's meeting authority.* Nothing in this requirement needs `Member.isLeader`; confirm the Assistant Leader schedules and cancels with exactly the Leader's authority.
