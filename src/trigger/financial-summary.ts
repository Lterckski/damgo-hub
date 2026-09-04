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
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 1);

    const approved = await prisma.transaction.findMany({
      where: { status: "APPROVED", createdAt: { gte: periodStart, lt: periodEnd } },
      select: { type: true, amount: true },
    });

    const incomeCentavos = approved.filter((t) => t.type === "INCOME").reduce((sum, t) => sum + t.amount, 0);
    const expenseCentavos = approved.filter((t) => t.type === "EXPENSE").reduce((sum, t) => sum + t.amount, 0);

    await notifyAdmins(`Financial summary — ${periodStart.toLocaleString("en-US", { month: "long", year: "numeric" })}`, {
      transactionCount: approved.length,
      income: formatPHP(incomeCentavos),
      expenses: formatPHP(expenseCentavos),
      net: formatPHP(incomeCentavos - expenseCentavos),
    });
  },
});
