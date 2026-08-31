import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getFinancialSnapshot } from "@/lib/finance";

// GET /api/finance/summary — running balance + this month's income/expense
// totals, in centavos (PHP). Only APPROVED transactions count.
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await getFinancialSnapshot();
  return NextResponse.json(snapshot);
}
