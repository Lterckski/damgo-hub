import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { isCurrentMemberAdmin } from "@/lib/current-member";
import { compactAgendaPositions, moveAgendaItemToPosition } from "@/lib/meetings";
import { prisma } from "@/lib/prisma";

// PATCH /api/meetings/[meetingId]/agenda-items/[agendaItemId] — Leader or
// Assistant Leader only. Edits text and/or moves the item to a validated
// position (moveAgendaItemToPosition clamps and renumbers).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ meetingId: string; agendaItemId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isCurrentMemberAdmin())) {
    return NextResponse.json(
      { error: "Only the Leader or Assistant Leader can edit the final agenda" },
      { status: 403 },
    );
  }

  const { meetingId, agendaItemId } = await params;
  const existing = await prisma.agendaItem.findUnique({ where: { id: agendaItemId } });
  if (!existing || existing.meetingId !== meetingId) {
    return NextResponse.json({ error: "Agenda item not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const { text, position } = body ?? {};

  if (text !== undefined && (typeof text !== "string" || text.trim() === "")) {
    return NextResponse.json({ error: "text must be a non-empty string" }, { status: 400 });
  }
  if (position !== undefined && (typeof position !== "number" || !Number.isInteger(position) || position < 0)) {
    return NextResponse.json({ error: "position must be a non-negative integer" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    if (typeof position === "number") {
      await moveAgendaItemToPosition(tx, meetingId, agendaItemId, position);
    }
    if (typeof text === "string") {
      await tx.agendaItem.update({ where: { id: agendaItemId }, data: { text: text.trim() } });
    }
  });

  const updated = await prisma.agendaItem.findUniqueOrThrow({
    where: { id: agendaItemId },
    include: { addedBy: { select: { displayName: true } } },
  });

  return NextResponse.json({
    agendaItem: {
      id: updated.id,
      text: updated.text,
      position: updated.position,
      addedById: updated.addedById,
      addedByName: updated.addedBy.displayName,
      sourceProposalId: updated.sourceProposalId,
      createdAt: updated.createdAt.toISOString(),
    },
  });
}

// DELETE /api/meetings/[meetingId]/agenda-items/[agendaItemId] — Leader or
// Assistant Leader only. Deletes the item, compacts the remaining
// positions, and — if it came from a proposal — sets that proposal back
// to DECLINED in the same transaction, so ACCEPTED always means "present
// on the final agenda," per this spec's explicit note.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ meetingId: string; agendaItemId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isCurrentMemberAdmin())) {
    return NextResponse.json(
      { error: "Only the Leader or Assistant Leader can remove agenda items" },
      { status: 403 },
    );
  }

  const { meetingId, agendaItemId } = await params;
  const existing = await prisma.agendaItem.findUnique({ where: { id: agendaItemId } });
  if (!existing || existing.meetingId !== meetingId) {
    return NextResponse.json({ error: "Agenda item not found" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.agendaItem.delete({ where: { id: agendaItemId } });
    await compactAgendaPositions(tx, meetingId, existing.position);
    if (existing.sourceProposalId) {
      await tx.agendaProposal.update({ where: { id: existing.sourceProposalId }, data: { status: "DECLINED" } });
    }
  });

  return NextResponse.json({ ok: true });
}
