import { entityVisibilityWhere } from "@/lib/hub/context";
import { prisma } from "@/lib/prisma";
import {
  teamMonthLabel,
  teamMonthStart,
  teamNextMonthStart,
} from "@/lib/team-time";

export interface FinancialSnapshot {
  /** All-time running balance — NOT month-scoped. See the note below. */
  balanceCentavos: number;
  monthIncomeCentavos: number;
  monthExpenseCentavos: number;
  /** "September 2026" — which month the two figures above cover. */
  monthLabel: string;
  /** When this snapshot was computed, for the "as of" stamp. */
  asOf: string;
}

/**
 * Running balance + this month's income/expense totals, in centavos (PHP).
 * Only APPROVED transactions count. Shared by GET /api/finance/summary and
 * the dashboard's finance widgets — was previously duplicated inline in
 * the route handler only, see 22-dashboard-data-wiring.md.
 *
 * Two things the old version got wrong, both fixed here:
 *
 * 1. The month boundary was `new Date(now.getFullYear(), now.getMonth(), 1)`
 *    — server-local time, which is UTC on Vercel. The team is in Manila
 *    (UTC+8), so anything recorded between midnight and 08:00 Manila on the
 *    1st counted toward the *previous* month. Boundaries now come from
 *    lib/team-time.ts.
 *
 * 2. `balanceCentavos` is all-time while the other two are month-scoped,
 *    but the UI rendered one caption — "This month, approved transactions
 *    only" — under all three. `monthLabel` is returned separately so each
 *    figure can be captioned for what it actually measures.
 *
 * "This month" means when the transaction was *recorded* (`createdAt`).
 * There is no separate value-date column, so a transaction entered late
 * lands in the month it was entered, not the month the money moved.
 */
export async function getFinancialSnapshot(): Promise<FinancialSnapshot> {
  const approved = await prisma.transaction.findMany({
    where: {
      ...{ status: "APPROVED" },
      AND: [await entityVisibilityWhere("transaction")],
    },
    select: { type: true, amount: true, createdAt: true },
  });

  const balanceCentavos = approved.reduce(
    (sum, t) => sum + (t.type === "INCOME" ? t.amount : -t.amount),
    0,
  );

  const now = new Date();
  const monthStart = teamMonthStart(now);
  const monthEnd = teamNextMonthStart(now);
  // Upper-bounded as well as lower-bounded: without it, a transaction with
  // a future createdAt (a backdated correction, a clock-skewed write) would
  // count toward this month forever.
  const thisMonth = approved.filter(
    (t) => t.createdAt >= monthStart && t.createdAt < monthEnd,
  );

  const monthIncomeCentavos = thisMonth
    .filter((t) => t.type === "INCOME")
    .reduce((sum, t) => sum + t.amount, 0);
  const monthExpenseCentavos = thisMonth
    .filter((t) => t.type === "EXPENSE")
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    balanceCentavos,
    monthIncomeCentavos,
    monthExpenseCentavos,
    monthLabel: teamMonthLabel(now),
    asOf: now.toISOString(),
  };
}

/** Shared serialization for Transaction API responses — see 07-financial-tracker.md. */
export interface SerializedTransaction {
  id: string;
  memberId: string;
  memberName: string;
  type: string;
  category: string;
  amountCentavos: number;
  description: string | null;
  status: string;
  hasReceipt: boolean;
  createdAt: string;
}

export function serializeTransaction(transaction: {
  id: string;
  memberId: string;
  member: { displayName: string };
  type: string;
  category: string;
  amount: number;
  description: string | null;
  receiptPath: string | null;
  status: string;
  createdAt: Date;
}): SerializedTransaction {
  return {
    id: transaction.id,
    memberId: transaction.memberId,
    memberName: transaction.member.displayName,
    type: transaction.type,
    category: transaction.category,
    amountCentavos: transaction.amount,
    description: transaction.description,
    status: transaction.status,
    hasReceipt: transaction.receiptPath !== null,
    createdAt: transaction.createdAt.toISOString(),
  };
}
