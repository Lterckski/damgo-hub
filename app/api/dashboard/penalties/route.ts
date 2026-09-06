import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";

import {
  claimPenaltyPaid,
  disputePenalty,
  requireMember,
} from "@/lib/dashboard/mutations";

// POST /api/dashboard/penalties — the two things a member may do about
// their own penalty: say they've paid it, or dispute it.
//
// Neither settles it. Resolving a penalty writes a ledger entry and stays
// an admin action (lib/admin/mutations.ts), so "Mark as paid" here records
// a claim that an admin confirms — the member gets a way to say "done"
// without being handed control of the books.
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

  const { action, penaltyId, reason } = body as Record<string, unknown>;
  if (typeof penaltyId !== "string") {
    return NextResponse.json(
      { error: "penaltyId is required" },
      { status: 400 },
    );
  }

  const outcome =
    action === "claim_paid"
      ? await claimPenaltyPaid(guard.member, penaltyId)
      : action === "dispute"
        ? await disputePenalty(guard.member, penaltyId, reason)
        : null;

  if (!outcome)
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  if (!outcome.ok)
    return NextResponse.json(
      { error: outcome.error },
      { status: outcome.status },
    );
  return NextResponse.json({ ok: true, message: outcome.message });
}
