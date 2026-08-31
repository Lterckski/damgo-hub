import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { isCurrentMemberAdmin } from "@/lib/current-member";
import { serializeTransaction } from "@/lib/finance";

// PATCH /api/finance/transactions/[transactionId] — Admin only. Approves or
// rejects a PENDING transaction; already-decided transactions can't be
// changed again (corrections happen via a new offsetting transaction, per
// architecture-context.md).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  const isAdmin = await isCurrentMemberAdmin();
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Only Admins can approve or reject transactions" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const { status } = body;

  if (status !== "APPROVED" && status !== "REJECTED") {
    return NextResponse.json(
      { error: "status must be APPROVED or REJECTED" },
      { status: 400 },
    );
  }

  const { transactionId } = await params;
  const existing = await prisma.transaction.findUnique({ where: { id: transactionId } });

  if (!existing) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  if (existing.status !== "PENDING") {
    return NextResponse.json(
      { error: "This transaction has already been decided" },
      { status: 409 },
    );
  }

  const transaction = await prisma.transaction.update({
    where: { id: transactionId },
    data: { status },
    include: { member: { select: { displayName: true } } },
  });

  return NextResponse.json({ transaction: serializeTransaction(transaction) });
}
