import { entityVisibilityWhere } from "@/lib/hub/context";
import { requireWorkspacePage as requireWorkspaceSession } from "@/lib/hub/context";
import { prisma } from "@/lib/prisma";
import { BackButton } from "@/components/shared/back-button";
import {
  FinanceTransactionsTable,
  type TransactionRow,
} from "@/components/finance/finance-transactions-table";

// All transactions, PENDING surfaced first — see 20-admin-dashboard.md.
// Reuses FinanceTransactionsTable (and its approve/reject row actions)
// from 07-financial-tracker.md as-is; that table always groups its
// "All Transactions" list by month regardless of input order, so a
// distinct "Needs Review" table above it (same component, just the
// PENDING subset) is what actually surfaces them first rather than
// leaving them wherever their own createdAt month happens to land.
export default async function AdminFinancePage() {
  await requireWorkspaceSession();

  const transactions = await prisma.transaction.findMany({
    where: await entityVisibilityWhere("transaction"),
    include: { member: { select: { displayName: true } } },
    orderBy: { createdAt: "desc" },
  });

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

  const pending = rows.filter((t) => t.status === "PENDING");

  return (
    <div className="p-6">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="font-display text-3xl text-copy-primary">Finance</h1>
      </div>
      <p className="mt-1 text-sm text-copy-secondary">
        All transactions, with pending approvals surfaced first.
      </p>

      {pending.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-xs font-bold tracking-wide text-copy-primary uppercase">
            Needs Review ({pending.length})
          </h2>
          <FinanceTransactionsTable transactions={pending} isAdmin />
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-2 text-xs font-bold tracking-wide text-copy-primary uppercase">
          All Transactions
        </h2>
        <FinanceTransactionsTable transactions={rows} isAdmin />
      </div>
    </div>
  );
}
