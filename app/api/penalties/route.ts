import { entityVisibilityWhere } from "@/lib/hub/context";
import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import { pesosToCentavos } from "@/lib/currency";
import { getOrgSettings } from "@/lib/org-settings";
import {
  PENALTY_INCLUDE,
  resolvePenaltyReason,
  serializePenalty,
} from "@/lib/penalties";
import { prisma } from "@/lib/prisma";

// GET /api/penalties — Admins see every penalty; a regular member sees
// only their own. See 18-penalty-tracker.md's Routes section.
export async function GET() {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [member, isAdmin] = await Promise.all([
    getCurrentMember(),
    isCurrentMemberAdmin(),
  ]);

  const penalties = await prisma.penalty.findMany({
    where: {
      ...(isAdmin ? undefined : { memberId: member.id }),
      AND: [await entityVisibilityWhere("penalty")],
    },
    include: PENALTY_INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ penalties: penalties.map(serializePenalty) });
}

// POST /api/penalties — Admin only. amountCents is optional (unset for a
// purely behavioral/warning penalty); the request sends a plain peso
// amount, same convention as POST /api/finance/transactions.
export async function POST(request: Request) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [issuer, isAdmin] = await Promise.all([
    getCurrentMember(),
    isCurrentMemberAdmin(),
  ]);
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Only Admins can issue a penalty" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
  const { memberId, reasonChoice, reason, amountPesos } = body;

  if (typeof memberId !== "string" || memberId.trim() === "") {
    return NextResponse.json(
      { error: "memberId is required" },
      { status: 400 },
    );
  }
  // The reason comes from the configured preset list (OrgSettings.penaltyRules)
  // or is the "Other" escape hatch. A preset's amount is fixed by the setting,
  // not by the request: the client sends only which rule was chosen, so a
  // hand-crafted body cannot issue "Missed a meeting" for an arbitrary sum.
  const { penaltyRules } = await getOrgSettings();
  const choice = resolvePenaltyReason(reasonChoice ?? reason, penaltyRules);
  if (!choice) {
    return NextResponse.json(
      {
        error:
          "reasonChoice must be one of the configured penalty rules, or \"Other\"",
      },
      { status: 400 },
    );
  }
  if (choice.kind === "other" && (typeof reason !== "string" || reason.trim() === "")) {
    return NextResponse.json(
      { error: "reason is required when the reason is Other" },
      { status: 400 },
    );
  }

  const target = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json(
      { error: "memberId is not a real member" },
      { status: 400 },
    );
  }

  // Postgres INTEGER's max — amountCents is stored in that column, and a
  // value big enough to overflow it would otherwise surface as an opaque
  // database error instead of a clean 400. A converted value below ₱0.01
  // (e.g. 0.001) rounds to 0 centavos, which isn't a real monetary
  // penalty either — reject it the same way.
  const MAX_AMOUNT_CENTS = 2_147_483_647;

  let amountCents: number | null = null;
  if (choice.kind === "preset") {
    // Taken from the setting, never from the request body.
    amountCents = choice.rule.amountCents > 0 ? choice.rule.amountCents : null;
  } else if (
    amountPesos !== undefined &&
    amountPesos !== null &&
    amountPesos !== ""
  ) {
    const parsed = Number(amountPesos);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return NextResponse.json(
        { error: "amountPesos must be a positive number" },
        { status: 400 },
      );
    }
    const converted = pesosToCentavos(parsed);
    if (
      !Number.isSafeInteger(converted) ||
      converted < 1 ||
      converted > MAX_AMOUNT_CENTS
    ) {
      return NextResponse.json(
        { error: "amountPesos is out of range" },
        { status: 400 },
      );
    }
    amountCents = converted;
  }

  const penalty = await prisma.penalty.create({
    data: {
      memberId: target.id,
      issuedById: issuer.id,
      reason:
        choice.kind === "preset" ? choice.rule.label : String(reason).trim(),
      amountCents,
    },
    include: PENALTY_INCLUDE,
  });

  return NextResponse.json(
    { penalty: serializePenalty(penalty) },
    { status: 201 },
  );
}
