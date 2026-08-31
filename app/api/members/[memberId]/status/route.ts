import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { isCurrentMemberAdmin } from "@/lib/current-member";

const VALID_STATUSES = new Set(["ACTIVE", "INACTIVE"]);

// PATCH /api/members/[memberId]/status — org:admin only.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const isAdmin = await isCurrentMemberAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { memberId } = await params;
  const body = await request.json().catch(() => null);
  const status = body?.status;

  if (typeof status !== "string" || !VALID_STATUSES.has(status)) {
    return NextResponse.json(
      { error: "status must be one of ACTIVE, INACTIVE" },
      { status: 400 },
    );
  }

  const member = await prisma.member.update({
    where: { id: memberId },
    data: { status: status as "ACTIVE" | "INACTIVE" },
  });

  return NextResponse.json({ member });
}
