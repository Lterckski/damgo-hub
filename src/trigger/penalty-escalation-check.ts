import { schedules } from "@trigger.dev/sdk";

import { notifyAdmins } from "@/lib/admin-notifications";
import { prisma } from "@/lib/prisma";

// Recurring scan for unresolved penalties — see 21-scheduled-reminders.md
// step 4. Runs daily; "past threshold" is a fixed 7 days for now (not
// configurable via any UI yet — this app has no settings surface for it,
// so it's a constant here rather than a half-built config option).
// Delivery is deferred (logged, not emailed), per this spec's explicit
// scope note.
const ESCALATION_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export const penaltyEscalationCheckTask = schedules.task({
  id: "penalty-escalation-check",
  cron: "0 8 * * *", // once a day, 08:00 UTC
  run: async () => {
    const olderThan = new Date(Date.now() - ESCALATION_THRESHOLD_MS);

    const stalePenalties = await prisma.penalty.findMany({
      where: { status: "OPEN", createdAt: { lte: olderThan } },
      select: { id: true, reason: true, createdAt: true, member: { select: { displayName: true } } },
    });

    if (stalePenalties.length === 0) return;

    await notifyAdmins(`${stalePenalties.length} penalty(ies) still open past 7 days`, {
      penalties: stalePenalties.map((p) => ({
        penaltyId: p.id,
        memberName: p.member.displayName,
        reason: p.reason,
        issuedAt: p.createdAt.toISOString(),
      })),
    });
  },
});
