import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import { PENALTY_INCLUDE, serializePenalty } from "@/lib/penalties";
import { prisma } from "@/lib/prisma";

// PATCH /api/penalties/[penaltyId] — Admin only. Resolves or waives an
// OPEN penalty; an already-decided one can't be re-decided (409). See
// 18-penalty-tracker.md's "Link to the financial ledger" section.
export async function PATCH(request: Request, { params }: { params: Promise<{ penaltyId: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [resolvingAdmin, isAdmin] = await Promise.all([getCurrentMember(), isCurrentMemberAdmin()]);
  if (!isAdmin) {
    return NextResponse.json({ error: "Only Admins can resolve or waive a penalty" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const status = body?.status;
  if (status !== "RESOLVED" && status !== "WAIVED") {
    return NextResponse.json({ error: "status must be RESOLVED or WAIVED" }, { status: 400 });
  }

  const { penaltyId } = await params;
  const existing = await prisma.penalty.findUnique({ where: { id: penaltyId } });
  if (!existing) {
    return NextResponse.json({ error: "Penalty not found" }, { status: 404 });
  }
  if (existing.status !== "OPEN") {
    return NextResponse.json({ error: "This penalty has already been decided" }, { status: 409 });
  }

  const resolvedAt = new Date();

  const penalty = await prisma.$transaction(async (tx) => {
    const updated = await tx.penalty.update({
      where: { id: penaltyId },
      data: { status, resolvedAt },
    });

    // Only a monetary penalty being RESOLVED (not WAIVED) creates a
    // ledger entry — auto-approved, since only an Admin can reach this
    // path at all (the same gate the manual approve flow uses).
    if (status === "RESOLVED" && updated.amountCents !== null) {
      await tx.transaction.create({
        data: {
          memberId: resolvingAdmin.id,
          type: "INCOME",
          category: "Penalty",
          amount: updated.amountCents,
          status: "APPROVED",
          description: updated.reason,
          penaltyId: updated.id,
        },
      });
    }

    return tx.penalty.findUniqueOrThrow({ where: { id: penaltyId }, include: PENALTY_INCLUDE });
  });

  return NextResponse.json({ penalty: serializePenalty(penalty) });
}
