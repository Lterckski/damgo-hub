import { prisma } from "@/lib/prisma";

export interface FinancialSnapshot {
  balanceCentavos: number;
  monthIncomeCentavos: number;
  monthExpenseCentavos: number;
}

/**
 * Running balance + this month's income/expense totals, in centavos (PHP).
 * Only APPROVED transactions count. Shared by GET /api/finance/summary and
 * the dashboard's Financial Snapshot widget — was previously duplicated
 * inline in the route handler only, see 22-dashboard-data-wiring.md.
 */
export async function getFinancialSnapshot(): Promise<FinancialSnapshot> {
  const approved = await prisma.transaction.findMany({
    where: { status: "APPROVED" },
    select: { type: true, amount: true, createdAt: true },
  });

  const balanceCentavos = approved.reduce(
    (sum, t) => sum + (t.type === "INCOME" ? t.amount : -t.amount),
    0,
  );

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonth = approved.filter((t) => t.createdAt >= monthStart);

  const monthIncomeCentavos = thisMonth
    .filter((t) => t.type === "INCOME")
    .reduce((sum, t) => sum + t.amount, 0);
  const monthExpenseCentavos = thisMonth
    .filter((t) => t.type === "EXPENSE")
    .reduce((sum, t) => sum + t.amount, 0);

  return { balanceCentavos, monthIncomeCentavos, monthExpenseCentavos };
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
