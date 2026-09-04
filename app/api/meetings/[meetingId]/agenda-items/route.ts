import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import { nextAgendaPosition, runSerializableMeetingTransaction } from "@/lib/meetings";
import { prisma } from "@/lib/prisma";

// POST /api/meetings/[meetingId]/agenda-items — Leader or Assistant
// Leader only; adds an item directly to the end of the final agenda.
export async function POST(request: Request, { params }: { params: Promise<{ meetingId: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isCurrentMemberAdmin())) {
    return NextResponse.json(
      { error: "Only the Leader or Assistant Leader can add agenda items" },
      { status: 403 },
    );
  }

  const { meetingId } = await params;
  const member = await getCurrentMember();

  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { id: true } });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (text === "") {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const agendaItem = await runSerializableMeetingTransaction(async (tx) => {
    const position = await nextAgendaPosition(tx, meetingId);
    return tx.agendaItem.create({
      data: { meetingId, text, position, addedById: member.id },
      include: { addedBy: { select: { displayName: true } } },
    });
  });

  return NextResponse.json(
    {
      agendaItem: {
        id: agendaItem.id,
        text: agendaItem.text,
        position: agendaItem.position,
        addedById: agendaItem.addedById,
        addedByName: agendaItem.addedBy.displayName,
        sourceProposalId: agendaItem.sourceProposalId,
        createdAt: agendaItem.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
