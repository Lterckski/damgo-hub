Set up the durable/scheduled background jobs using Trigger.dev. Per `architecture-context.md`, these are reminder and recurring-check jobs, not AI generation — request handlers only enqueue them.

## Implementation

1. Check the existing Trigger.dev setup before adding new patterns; reuse it.

2. Create `trigger/meeting-reminder.ts`.

   - a scheduled/delayed task that fires ahead of a `Meeting.scheduledAt` (e.g. 24h and 1h before)
   - notifies each `MeetingParticipant`
   - triggered when a meeting is created/rescheduled (`16-meeting-scheduling.md`'s create/update routes enqueue it; cancel/reschedule should cancel the previously scheduled run)

3. Create `trigger/calendar-reminder.ts`.

   - a scheduled/delayed task that fires ahead of a `CalendarEvent.startAt`
   - notifies the event's creator (and, if it later supports invitees, those too)
   - triggered from `10-calendar.md`'s create/update routes

4. Create `trigger/penalty-escalation-check.ts`.

   - a recurring (cron) task that scans for `Penalty` rows with `status: OPEN` older than a configurable threshold
   - notifies Admins of unresolved penalties past that threshold

5. Create `trigger/financial-summary.ts`.

   - a recurring (cron) task, e.g. monthly, that generates a summary of `APPROVED` transactions for the period and notifies Admins

6. Notification delivery for all four tasks: for this unit, log the notification payload (recipient, message, related record ID) rather than integrating a specific email/push provider — the delivery channel is a separate decision to make later. Keep the payload shape consistent across all four tasks so a real channel can be swapped in without touching the task logic.

## Scope Limits

- don't call any AI providers — these are scheduling/notification jobs only
- don't run this logic inline in request handlers — routes only enqueue/cancel these tasks
- don't build a notification UI yet — this unit is backend-only

## Check When Done

- meeting and calendar reminders are scheduled on create and rescheduled/cancelled on update/delete
- the penalty escalation check and financial summary run on a recurring schedule
- all four tasks log a consistent notification payload shape
- `npm run build` passes
