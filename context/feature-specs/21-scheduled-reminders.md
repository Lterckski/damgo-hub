Set up the durable/scheduled background jobs using Trigger.dev. Per `architecture-context.md`, these are reminder and recurring-check jobs, not AI generation — request handlers only enqueue them. The Resend helper and meeting invitation/reminder tasks are created earlier by `16-meeting-scheduling.md`; reuse them here rather than building a parallel meeting-email path.

## Implementation

1. Check the existing Trigger.dev setup before adding new patterns; reuse it.

2. Verify and extend `trigger/meeting-reminder.ts` from `16-meeting-scheduling.md`.

   - a scheduled/delayed task that fires ahead of a `Meeting.scheduledAt` (e.g. 24h and 1h before)
   - sends an individual email to each current `MeetingParticipant` through the shared Resend helper
   - triggered when a meeting is created/rescheduled (`16-meeting-scheduling.md`'s create/update routes enqueue it; cancel/reschedule should cancel the previously scheduled run)
   - skip a reminder occurrence whose scheduled time is already in the past
   - re-check that the meeting still exists and the recipient is still a participant immediately before sending

3. Create `trigger/calendar-reminder.ts`.

   - a scheduled/delayed task that fires ahead of a `CalendarEvent.startAt`
   - notifies the event's creator (and, if it later supports invitees, those too)
   - triggered from `10-calendar.md`'s create/update routes

4. Create `trigger/penalty-escalation-check.ts`.

   - a recurring (cron) task that scans for `Penalty` rows with `status: OPEN` older than a configurable threshold
   - notifies Admins of unresolved penalties past that threshold

5. Create `trigger/financial-summary.ts`.

   - a recurring (cron) task, e.g. monthly, that generates a summary of `APPROVED` transactions for the period and notifies Admins

6. Reuse the **Resend** delivery infrastructure from `16-meeting-scheduling.md`.

   - confirm the official `resend` package is installed
   - confirm `RESEND_API_KEY`, `MEETING_EMAIL_FROM`, and the canonical production `APP_URL` are documented and configured; never expose them to client code
   - reuse the server-only helper in `lib/email.ts` and its typed payload/idempotency key contract
   - reuse the meeting email template covering invitations, updates, participant/meeting cancellations, and reminders
   - format meeting times with an explicit timezone label and include the Damgo Hub meeting-detail URL
   - send one message per recipient rather than revealing addresses through `To`/`CC`
   - use Trigger.dev retries for provider failures; a failed email never rolls back the source mutation

   The calendar-reminder, penalty-escalation, and financial-summary tasks keep the same typed notification payload but only meeting notifications require real email delivery in this unit. Their delivery channels remain deferred until explicitly requested.

7. Verify the existing `trigger/meeting-notification.ts` task handles invitation, update, participant-removal, and meeting-cancellation emails. Meeting create/update/delete routes enqueue it after the database mutation succeeds with the recipient IDs, notification type, meeting revision, and an immutable snapshot of the meeting details needed to render the email (required because a cancellation can run after the meeting row is deleted). The task resolves current member email addresses server-side and uses a stable idempotency key per meeting, recipient, notification type, and meeting revision.

## External Setup

- Create a Resend account and verify the sender domain.
- Create a Resend API key and configure `RESEND_API_KEY` in local development and Vercel.
- Configure `MEETING_EMAIL_FROM` with an address on the verified domain.
- Configure `APP_URL` with the canonical Damgo Hub production origin so email links never point at a preview deployment.

## Scope Limits

- don't call any AI providers — these are scheduling/notification jobs only
- don't run this logic inline in request handlers — routes only enqueue/cancel these tasks
- don't build a notification UI yet — this unit is backend-only
- don't send a meeting email to organization Admins unless they are participants

## Check When Done

- meeting and calendar reminders are scheduled on create and rescheduled/cancelled on update/delete
- meeting invitations, updates, cancellations, and 24-hour/1-hour reminders are delivered through Resend without exposing recipient addresses
- retries do not duplicate an already-delivered meeting email
- the penalty escalation check and financial summary run on a recurring schedule
- non-meeting tasks keep a consistent typed notification payload even when their real delivery channel is still deferred
- `npm run build` passes
