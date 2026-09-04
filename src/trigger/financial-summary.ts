import { schedules } from "@trigger.dev/sdk";

import { notifyAdmins } from "@/lib/admin-notifications";
import { formatPHP } from "@/lib/currency";
import { prisma } from "@/lib/prisma";

// Recurring financial summary — see 21-scheduled-reminders.md step 5.
// Runs monthly, on the 1st, summarizing the calendar month that just
// ended (not the one just starting, which would have ~no data yet).
// Delivery is deferred (logged, not emailed), per this spec's explicit
// scope note.
export const financialSummaryTask = schedules.task({
  id: "financial-summary",
  cron: "0 9 1 * *", // 09:00 UTC on the 1st of every month
  run: async () => {
    // Explicit UTC, not the worker's local time zone — the cron fires at
    // 09:00 UTC, but a local-time `new Date(year, month, 1)` would shift
    // the computed month boundary in any time zone where that moment
    // hasn't rolled over to the 1st yet (e.g. still the 31st in
    // Pacific/Honolulu), silently summarizing the wrong month.
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const approved = await prisma.transaction.findMany({
      where: { status: "APPROVED", createdAt: { gte: periodStart, lt: periodEnd } },
      select: { type: true, amount: true },
    });

    const incomeCentavos = approved.filter((t) => t.type === "INCOME").reduce((sum, t) => sum + t.amount, 0);
    const expenseCentavos = approved.filter((t) => t.type === "EXPENSE").reduce((sum, t) => sum + t.amount, 0);

    await notifyAdmins(`Financial summary — ${periodStart.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}`, {
      transactionCount: approved.length,
      income: formatPHP(incomeCentavos),
      expenses: formatPHP(expenseCentavos),
      net: formatPHP(incomeCentavos - expenseCentavos),
    });
  },
});
