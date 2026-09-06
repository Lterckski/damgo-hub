import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";

import { pesosToCentavos } from "@/lib/currency";
import { getOrgSettings } from "@/lib/org-settings";
import { requireMember } from "@/lib/dashboard/mutations";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/dashboard/expenses — a member submits an out-of-pocket expense
 * for approval.
 *
 * This exists because `POST /api/finance/transactions` is admin-only, so
 * before now a non-admin had no way to claim a reimbursement at all — which
 * made "You're owed (reimbursements pending approval)" impossible to ever
 * be non-zero for four of the five people on the team, and left the admin
 * console's "pending transactions" queue with nothing but the admin's own
 * entries in it.
 *
 * Scope is deliberately narrow, so this doesn't become a back door around
 * that admin-only route:
 *
 *   - always EXPENSE, never INCOME
 *   - always PENDING; the caller cannot set a status
 *   - always attributed to the caller; the caller cannot set memberId
 *   - no receipt upload here (that stays with the existing finance flow)
 *
 * The result is a request awaiting an admin decision — the same shape as a
 * join request — not a mutation of the ledger.
 */
export async function POST(request: Request) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { amountPesos, category, description } = body as Record<
    string,
    unknown
  >;

  const amount =
    typeof amountPesos === "number" ? amountPesos : Number(amountPesos);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Enter an amount greater than zero" },
      { status: 400 },
    );
  }
  if (typeof category !== "string" || category.trim() === "") {
    return NextResponse.json({ error: "Pick a category" }, { status: 400 });
  }

  // Categories are configurable (OrgSettings), so validate against the
  // live list rather than a hardcoded one that would drift.
  const settings = await getOrgSettings();
  if (!settings.financeCategories.includes(category.trim())) {
    return NextResponse.json(
      { error: "That isn't a valid category" },
      { status: 400 },
    );
  }

  const transaction = await prisma.transaction.create({
    data: {
      memberId: guard.member.id,
      type: "EXPENSE",
      category: category.trim(),
      amount: pesosToCentavos(amount),
      description:
        typeof description === "string" && description.trim() !== ""
          ? description.trim()
          : null,
      status: "PENDING",
    },
    select: { id: true },
  });

  await prisma.activityEvent.create({
    data: {
      type: "TRANSACTION_SUBMITTED",
      actorId: guard.member.id,
      actorName: guard.member.displayName,
      entityType: "TRANSACTION",
      entityId: transaction.id,
      entityLabel: `${category.trim()} expense`,
      summary: `${guard.member.displayName} submitted a ${category.trim()} expense for approval`,
    },
  });

  return NextResponse.json(
    { ok: true, id: transaction.id, message: "Expense submitted for approval" },
    { status: 201 },
  );
}
