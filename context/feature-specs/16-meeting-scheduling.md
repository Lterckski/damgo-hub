# Meetings: Scheduling, Agenda Proposal, Quotes

## Goal

Build meeting scheduling, agenda proposals, and quote capture: schema, API, and UI. The live collaborative agenda board is a separate unit (`17-meeting-agenda-board.md`) that builds on top of the `Meeting` record created here.

## Schema

Create `prisma/models/meeting.prisma`.

Add `Meeting`:

- `id`
- `title`
- `scheduledAt`
- `organizerId` — relation to `Member`
- `agendaSnapshotPath` — optional Vercel Blob URL, used by the live agenda board (`17-meeting-agenda-board.md` / `15-board-autosave.md`)
- timestamps
- index on `scheduledAt`

Add `MeetingParticipant`:

- `meetingId` relation, cascade delete
- `memberId` relation
- unique constraint on `meetingId`/`memberId`

Add `AgendaProposal`:

- `meetingId` relation, cascade delete
- `proposedById` — relation to `Member`
- `text`
- `status` enum: `PENDING`, `ACCEPTED`, `DECLINED` — defaults to `PENDING`
- timestamps

Add `Quote`:

- `meetingId` relation, cascade delete
- `text`
- `saidById` — optional relation to `Member` (the person quoted may not have an account)
- `recordedById` — relation to `Member`
- `createdAt`

## Routes

Create REST endpoints under `app/api/meetings`:

- `GET /api/meetings` — list meetings; support `?upcoming=true`
- `POST /api/meetings` — schedule a meeting, current member becomes `organizerId`; accepts an initial participant list
- `GET /api/meetings/[meetingId]` — requires participation or Admin
- `PATCH /api/meetings/[meetingId]` — organizer only
- `POST /api/meetings/[meetingId]/agenda-proposals` — any participant can propose an item
- `PATCH /api/meetings/[meetingId]/agenda-proposals/[proposalId]` — organizer only, accept/decline
- `POST /api/meetings/[meetingId]/quotes` — any participant can add a quote
- `GET /api/meetings/[meetingId]/quotes` — list quotes for a meeting

## Pages

Create `app/(app)/meetings/page.tsx` (list) and `app/(app)/meetings/[meetingId]/page.tsx` (detail shell).

List page:

- upcoming/past `Tabs`
- card list: title, date/time, organizer, participant avatar stack
- "Schedule Meeting" button opens a `Dialog`: title, date/time, participant multi-select from the member roster

Detail page:

- header: title, date/time, organizer, participants
- "Agenda Proposals" panel: any participant can submit a proposed item (`Textarea` + submit); organizer sees accept/decline actions on `PENDING` proposals; accepted proposals feed into the live agenda board's starting content
- "Quotes" panel: simple running list, newest first, with an "Add Quote" input (quote text + optional "said by" member picker)
- a "Live Agenda" tab placeholder, wired up in `17-meeting-agenda-board.md`

## Check When Done

- meetings can be scheduled with participants
- participants can propose agenda items; only the organizer can accept/decline them
- quotes can be added and list correctly per meeting
- non-participants (and non-Admins) cannot view a meeting's detail page
- `npm run build` passes
