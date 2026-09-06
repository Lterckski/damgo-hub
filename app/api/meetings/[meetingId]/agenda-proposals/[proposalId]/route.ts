import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import {
  nextAgendaPosition,
  runSerializableMeetingTransaction,
} from "@/lib/meetings";

// PATCH /api/meetings/[meetingId]/agenda-proposals/[proposalId] — Leader
// or Assistant Leader only. Accepts (creates the linked AgendaItem in the
// same transaction) or declines a pending proposal.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ meetingId: string; proposalId: string }> },
) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isCurrentMemberAdmin())) {
    return NextResponse.json(
      {
        error:
          "Only the Leader or Assistant Leader can accept or decline proposals",
      },
      { status: 403 },
    );
  }

  const { meetingId, proposalId } = await params;
  const member = await getCurrentMember();

  const body = await request.json().catch(() => null);
  const status = body?.status;
  if (status !== "ACCEPTED" && status !== "DECLINED") {
    return NextResponse.json(
      { error: "status must be ACCEPTED or DECLINED" },
      { status: 400 },
    );
  }

  const result = await runSerializableMeetingTransaction(async (tx) => {
    const proposal = await tx.agendaProposal.findUnique({
      where: { id: proposalId },
    });
    if (!proposal || proposal.meetingId !== meetingId)
      return { kind: "not-found" } as const;

    const claim = await tx.agendaProposal.updateMany({
      where: { id: proposalId, meetingId, status: "PENDING" },
      data: { status },
    });
    if (claim.count === 0) return { kind: "conflict" } as const;
    if (status === "DECLINED") return { kind: "declined" } as const;

    const position = await nextAgendaPosition(tx, meetingId);
    const agendaItem = await tx.agendaItem.create({
      data: {
        meetingId,
        text: proposal.text,
        position,
        addedById: member.id,
        sourceProposalId: proposal.id,
      },
      include: { addedBy: { select: { displayName: true } } },
    });
    return { kind: "accepted", agendaItem } as const;
  });

  if (result.kind === "not-found") {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }
  if (result.kind === "conflict") {
    return NextResponse.json(
      { error: "This proposal has already been decided" },
      { status: 409 },
    );
  }
  if (result.kind === "declined") return NextResponse.json({ ok: true });

  const agendaItem = result.agendaItem;

  return NextResponse.json({
    agendaItem: {
      id: agendaItem.id,
      text: agendaItem.text,
      position: agendaItem.position,
      addedById: agendaItem.addedById,
      addedByName: agendaItem.addedBy.displayName,
      sourceProposalId: agendaItem.sourceProposalId,
      createdAt: agendaItem.createdAt.toISOString(),
    },
  });
}
