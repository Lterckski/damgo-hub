import { NextResponse } from "next/server";

import { requireAdmin, toErrorResponse } from "@/lib/admin/guard";
import { sendBroadcast } from "@/lib/admin/broadcasts";
import { recordAuditEvent } from "@/lib/audit-log";

const AUDIENCES = ["ALL_MEMBERS", "ROLE", "PROJECT", "MEMBER"] as const;
type Audience = (typeof AUDIENCES)[number];

function isAudience(value: unknown): value is Audience {
  return typeof value === "string" && (AUDIENCES as readonly string[]).includes(value);
}

// POST /api/admin/broadcasts — the composer's send. Audience resolution
// happens server-side in lib/admin/broadcasts.ts; the client sends who it
// wants to reach, never the resolved recipient list.
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { subject, body: message, audience, audienceRole, projectId, audienceMemberId } =
    body as Record<string, unknown>;

  if (typeof subject !== "string" || subject.trim() === "") {
    return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  }
  if (typeof message !== "string" || message.trim() === "") {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }
  if (!isAudience(audience)) {
    return NextResponse.json({ error: "Unknown audience" }, { status: 400 });
  }
  if (audience === "ROLE" && audienceRole !== "org:admin" && audienceRole !== "org:member") {
    return NextResponse.json({ error: "Pick a role to send to" }, { status: 400 });
  }
  if (audience === "PROJECT" && typeof projectId !== "string") {
    return NextResponse.json({ error: "Pick a project to send to" }, { status: 400 });
  }
  if (audience === "MEMBER" && typeof audienceMemberId !== "string") {
    return NextResponse.json({ error: "Pick a member to send to" }, { status: 400 });
  }

  try {
    const result = await sendBroadcast(guard.context.actor, {
      subject: subject.trim(),
      body: message.trim(),
      audience,
      audienceRole: typeof audienceRole === "string" ? audienceRole : null,
      projectId: typeof projectId === "string" ? projectId : null,
      audienceMemberId: typeof audienceMemberId === "string" ? audienceMemberId : null,
    });

    await recordAuditEvent({
      actor: guard.context.actor,
      action: "broadcast.sent",
      entityType: "BROADCAST",
      entityId: result.id,
      entityLabel: subject.trim(),
      after: { audience, recipientCount: result.recipientCount },
      reason: null,
    });

    if (result.recipientCount === 0) {
      return NextResponse.json(
        { ok: true, ...result, message: "Sent, but that audience currently has no members" },
        { status: 200 },
      );
    }

    return NextResponse.json({
      ok: true,
      ...result,
      message: `Sent to ${result.recipientCount} member${result.recipientCount === 1 ? "" : "s"}`,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
