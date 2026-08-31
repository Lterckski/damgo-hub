import { TrendingDown, TrendingUp, Wallet } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { isCurrentMemberAdmin } from "@/lib/current-member";
import { formatPHP } from "@/lib/currency";
import { DashboardWidget } from "@/components/dashboard/dashboard-widget";
import { BackButton } from "@/components/shared/back-button";
import {
  FinanceTransactionsTable,
  type TransactionRow,
} from "@/components/finance/finance-transactions-table";

function computeSummary(
  transactions: { type: string; amount: number; status: string; createdAt: Date }[],
) {
  const approved = transactions.filter((t) => t.status === "APPROVED");
  const balance = approved.reduce(
    (sum, t) => sum + (t.type === "INCOME" ? t.amount : -t.amount),
    0,
  );

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonth = approved.filter((t) => t.createdAt >= monthStart);
  const monthIncome = thisMonth
    .filter((t) => t.type === "INCOME")
    .reduce((sum, t) => sum + t.amount, 0);
  const monthExpense = thisMonth
    .filter((t) => t.type === "EXPENSE")
    .reduce((sum, t) => sum + t.amount, 0);

  return { balance, monthIncome, monthExpense };
}

export default async function FinancePage() {
  const [transactions, isAdmin] = await Promise.all([
    prisma.transaction.findMany({
      include: { member: { select: { displayName: true } } },
      orderBy: { createdAt: "desc" },
    }),
    isCurrentMemberAdmin(),
  ]);

  const { balance, monthIncome, monthExpense } = computeSummary(transactions);

  const rows: TransactionRow[] = transactions.map((t) => ({
    id: t.id,
    memberName: t.member.displayName,
    type: t.type as "INCOME" | "EXPENSE",
    category: t.category,
    amountCentavos: t.amount,
    description: t.description,
    status: t.status as "PENDING" | "APPROVED" | "REJECTED",
    hasReceipt: t.receiptPath !== null,
    createdAt: t.createdAt.toISOString(),
  }));

  return (
    <div className="p-6">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="font-display text-3xl text-copy-primary">Finance</h1>
      </div>
      <p className="mt-1 text-sm text-copy-secondary">
        The organization&apos;s shared ledger — all amounts in Philippine Pesos.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <DashboardWidget title="Balance" icon={Wallet}>
          <p className="text-2xl font-bold text-copy-primary">{formatPHP(balance)}</p>
        </DashboardWidget>
        <DashboardWidget title="This Month's Income" icon={TrendingUp}>
          <p className="text-2xl font-bold text-success">{formatPHP(monthIncome)}</p>
        </DashboardWidget>
        <DashboardWidget title="This Month's Expenses" icon={TrendingDown}>
          <p className="text-2xl font-bold text-error">{formatPHP(monthExpense)}</p>
        </DashboardWidget>
      </div>

      <div className="mt-6">
        <FinanceTransactionsTable transactions={rows} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
