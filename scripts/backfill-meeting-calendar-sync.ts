import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { enqueueGoogleCalendarSync } from "@/lib/sync-calendar";

/**
 * Backfills Google Calendar sync for meetings that already existed before
 * meeting sync shipped (18-penalty-tracker.md's sibling change in
 * 16-meeting-scheduling.md, 2026-09-08).
 *
 * The sync only enqueues on create/edit/delete, so a meeting scheduled
 * before that change has no synced copy on anyone's calendar. This walks
 * existing meetings and enqueues the same background job a fresh create
 * would, which is why it does not send any email: it touches nothing in the
 * meeting itself, only the calendar job. Editing the meeting in the UI to
 * force a sync would also fire "meeting updated" mail to every participant.
 *
 * Dry run by default — it prints what it would enqueue and exits:
 *
 *   DATABASE_URL="<production url>" TRIGGER_SECRET_KEY="<prod key>" \
 *     npx tsx scripts/backfill-meeting-calendar-sync.ts
 *
 * Add --apply to actually enqueue, and --all to include past meetings
 * (default is upcoming only — backfilling a meeting that already happened
 * puts a stale entry on five calendars for no benefit):
 *
 *   ... npx tsx scripts/backfill-meeting-calendar-sync.ts --apply
 *
 * Safe to re-run: the job upserts by (member, sourceType, sourceId), so a
 * second pass updates the same remote events rather than duplicating them.
 */

async function main() {
  const apply = process.argv.includes("--apply");
  const includePast = process.argv.includes("--all");

  const meetings = await prisma.meeting.findMany({
    where: includePast ? {} : { scheduledAt: { gte: new Date() } },
    select: {
      id: true,
      title: true,
      scheduledAt: true,
      participants: { select: { memberId: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });

  if (meetings.length === 0) {
    console.log(
      includePast
        ? "No meetings found at all."
        : "No upcoming meetings. Pass --all to include past ones.",
    );
    return;
  }

  // Which of these already have synced copies, so a re-run reads clearly
  // as "refreshing" rather than "creating".
  const alreadySynced = await prisma.googleCalendarSyncedEvent.groupBy({
    by: ["sourceId"],
    where: { sourceType: "MEETING", sourceId: { in: meetings.map((m) => m.id) } },
    _count: { _all: true },
  });
  const syncedCounts = new Map(
    alreadySynced.map((row) => [row.sourceId, row._count._all]),
  );

  console.log(
    `${meetings.length} ${includePast ? "" : "upcoming "}meeting(s)${apply ? "" : " (dry run — nothing enqueued)"}:\n`,
  );
  for (const meeting of meetings) {
    const synced = syncedCounts.get(meeting.id) ?? 0;
    console.log(
      `  ${meeting.scheduledAt.toISOString()}  ${meeting.title}\n` +
        `      id=${meeting.id}  participants=${meeting.participants.length}  ` +
        `already synced to ${synced} calendar(s)`,
    );
    if (meeting.participants.length === 0) {
      console.log("      ⚠ no participants — nothing to sync");
    }
  }

  if (!apply) {
    console.log(
      "\nRe-run with --apply to enqueue the sync job for each meeting above.",
    );
    return;
  }

  console.log("\nEnqueueing…");
  for (const meeting of meetings) {
    await enqueueGoogleCalendarSync("MEETING", meeting.id);
    console.log(`  queued ${meeting.id}`);
  }
  console.log(
    `\nEnqueued ${meetings.length} job(s). They run on the Trigger.dev worker, ` +
      "so confirm there that they completed — a member whose Google account is " +
      "not connected with the calendar.events scope is skipped silently by design.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
