import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import { nextAgendaPosition } from "@/lib/meetings";
import { prisma } from "@/lib/prisma";

// PATCH /api/meetings/[meetingId]/agenda-proposals/[proposalId] — Leader
// or Assistant Leader only. Accepts (creates the linked AgendaItem in the
// same transaction) or declines a pending proposal.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ meetingId: string; proposalId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isCurrentMemberAdmin())) {
    return NextResponse.json(
      { error: "Only the Leader or Assistant Leader can accept or decline proposals" },
      { status: 403 },
    );
  }

  const { meetingId, proposalId } = await params;
  const member = await getCurrentMember();

  const body = await request.json().catch(() => null);
  const status = body?.status;
  if (status !== "ACCEPTED" && status !== "DECLINED") {
    return NextResponse.json({ error: "status must be ACCEPTED or DECLINED" }, { status: 400 });
  }

  const proposal = await prisma.agendaProposal.findUnique({ where: { id: proposalId } });
  if (!proposal || proposal.meetingId !== meetingId) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }
  // A proposal that already has a linked agenda item cannot be accepted
  // again, per this spec — and a declined one can't be re-decided either;
  // both cases collapse to "this proposal is no longer PENDING."
  if (proposal.status !== "PENDING") {
    return NextResponse.json({ error: "This proposal has already been decided" }, { status: 409 });
  }

  if (status === "DECLINED") {
    await prisma.agendaProposal.update({ where: { id: proposalId }, data: { status: "DECLINED" } });
    return NextResponse.json({ ok: true });
  }

  const agendaItem = await prisma.$transaction(async (tx) => {
    const position = await nextAgendaPosition(tx, meetingId);
    const item = await tx.agendaItem.create({
      data: { meetingId, text: proposal.text, position, addedById: member.id, sourceProposalId: proposal.id },
      include: { addedBy: { select: { displayName: true } } },
    });
    await tx.agendaProposal.update({ where: { id: proposalId }, data: { status: "ACCEPTED" } });
    return item;
  });

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
