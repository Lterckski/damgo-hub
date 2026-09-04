import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getCurrentMember } from "@/lib/current-member";
import { prisma } from "@/lib/prisma";

// POST /api/meetings/[meetingId]/agenda-proposals — any participant can
// propose an item; always created PENDING. Client-supplied status/position
// are ignored entirely (not even read from the body), per this spec's
// explicit "ignores/rejects client-supplied status or position fields."
export async function POST(request: Request, { params }: { params: Promise<{ meetingId: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;
  const member = await getCurrentMember();

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { participants: { select: { memberId: true } } },
  });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  if (!meeting.participants.some((p) => p.memberId === member.id)) {
    return NextResponse.json({ error: "Only participants can propose agenda items" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (text === "") {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const proposal = await prisma.agendaProposal.create({
    data: { meetingId, proposedById: member.id, text, status: "PENDING" },
    include: { proposedBy: { select: { displayName: true } } },
  });

  return NextResponse.json(
    {
      proposal: {
        id: proposal.id,
        text: proposal.text,
        status: proposal.status,
        proposedById: proposal.proposedById,
        proposedByName: proposal.proposedBy.displayName,
        createdAt: proposal.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
