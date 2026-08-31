import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";

// GET /api/finance/summary — running balance + this month's income/expense
// totals, in centavos (PHP). Only APPROVED transactions count.
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  return NextResponse.json({ balanceCentavos, monthIncomeCentavos, monthExpenseCentavos });
}
