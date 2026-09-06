import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";

import { dismissAnnouncement, requireMember } from "@/lib/dashboard/mutations";

// POST /api/dashboard/announcements — dismiss one announcement for the
// calling member only. Dismissal is per-member by design: an announcement
// one person has read must stay up for everyone else, which is exactly why
// this is a separate model from Broadcast.
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

  const { announcementId } = body as Record<string, unknown>;
  if (typeof announcementId !== "string") {
    return NextResponse.json(
      { error: "announcementId is required" },
      { status: 400 },
    );
  }

  const outcome = await dismissAnnouncement(guard.member, announcementId);
  if (!outcome.ok)
    return NextResponse.json(
      { error: outcome.error },
      { status: outcome.status },
    );
  return NextResponse.json({ ok: true, message: outcome.message });
}
