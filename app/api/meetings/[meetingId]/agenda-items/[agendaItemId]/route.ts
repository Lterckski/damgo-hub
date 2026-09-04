import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { isCurrentMemberAdmin } from "@/lib/current-member";
import {
  compactAgendaPositions,
  moveAgendaItemToPosition,
  runSerializableMeetingTransaction,
} from "@/lib/meetings";
import { prisma } from "@/lib/prisma";

class AgendaItemNotFoundError extends Error {}

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
  const body = await request.json().catch(() => null);
  const { text, position } = body ?? {};

  if (text !== undefined && (typeof text !== "string" || text.trim() === "")) {
    return NextResponse.json({ error: "text must be a non-empty string" }, { status: 400 });
  }
  if (position !== undefined && (typeof position !== "number" || !Number.isInteger(position) || position < 0)) {
    return NextResponse.json({ error: "position must be a non-negative integer" }, { status: 400 });
  }

  try {
    await runSerializableMeetingTransaction(async (tx) => {
      const current = await tx.agendaItem.findUnique({ where: { id: agendaItemId } });
      if (!current || current.meetingId !== meetingId) throw new AgendaItemNotFoundError();

      if (typeof position === "number") {
        await moveAgendaItemToPosition(tx, meetingId, agendaItemId, position);
      }
      if (typeof text === "string") {
        await tx.agendaItem.update({ where: { id: agendaItemId }, data: { text: text.trim() } });
      }
    });
  } catch (error) {
    if (error instanceof AgendaItemNotFoundError) {
      return NextResponse.json({ error: "Agenda item not found" }, { status: 404 });
    }
    throw error;
  }

  const updated = await prisma.agendaItem.findUnique({
    where: { id: agendaItemId },
    include: { addedBy: { select: { displayName: true } } },
  });
  if (!updated) return NextResponse.json({ error: "Agenda item not found" }, { status: 404 });

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
  try {
    await runSerializableMeetingTransaction(async (tx) => {
      const current = await tx.agendaItem.findUnique({ where: { id: agendaItemId } });
      if (!current || current.meetingId !== meetingId) throw new AgendaItemNotFoundError();

      await tx.agendaItem.delete({ where: { id: agendaItemId } });
      await compactAgendaPositions(tx, meetingId, current.position);
      if (current.sourceProposalId) {
        await tx.agendaProposal.updateMany({
          where: { id: current.sourceProposalId },
          data: { status: "DECLINED" },
        });
      }
    });
  } catch (error) {
    if (error instanceof AgendaItemNotFoundError) {
      return NextResponse.json({ error: "Agenda item not found" }, { status: 404 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
