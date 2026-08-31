import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import { serializeAttachment, serializeDoc } from "@/lib/docs";

// GET /api/docs/[docId] — any authenticated member; fetches the doc with its attachments.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ docId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { docId } = await params;
  const doc = await prisma.doc.findUnique({
    where: { id: docId },
    include: { author: true, attachments: true },
  });

  if (!doc) {
    return NextResponse.json({ error: "Doc not found" }, { status: 404 });
  }

  return NextResponse.json({
    doc: serializeDoc(doc),
    attachments: doc.attachments.map(serializeAttachment),
  });
}

// PATCH /api/docs/[docId] — author or Admin only; updates title/content.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ docId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [member, isAdmin] = await Promise.all([getCurrentMember(), isCurrentMemberAdmin()]);
  const { docId } = await params;

  const existing = await prisma.doc.findUnique({ where: { id: docId } });
  if (!existing) {
    return NextResponse.json({ error: "Doc not found" }, { status: 404 });
  }
  if (existing.authorId !== member.id && !isAdmin) {
    return NextResponse.json(
      { error: "Only the author or an Admin can edit this doc" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const { title, content, driveFile } = body;

  const doc = await prisma.doc.update({
    where: { id: docId },
    data: {
      ...(typeof title === "string" && title.trim() !== "" ? { title: title.trim() } : {}),
      ...(typeof content === "string" ? { content } : {}),
      // driveFile: { id, name, mimeType, url } to attach/replace a link,
      // null to remove it, undefined (the key just absent) to leave it
      // untouched — same as every other optional PATCH field here.
      ...(driveFile !== undefined
        ? {
            driveFileId: driveFile?.id ?? null,
            driveFileName: driveFile?.name ?? null,
            driveFileMimeType: driveFile?.mimeType ?? null,
            driveFileUrl: driveFile?.url ?? null,
          }
        : {}),
    },
    include: { author: true },
  });

  return NextResponse.json({ doc: serializeDoc(doc) });
}

// DELETE /api/docs/[docId] — author or Admin only.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ docId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [member, isAdmin] = await Promise.all([getCurrentMember(), isCurrentMemberAdmin()]);
  const { docId } = await params;

  const existing = await prisma.doc.findUnique({ where: { id: docId } });
  if (!existing) {
    return NextResponse.json({ error: "Doc not found" }, { status: 404 });
  }
  if (existing.authorId !== member.id && !isAdmin) {
    return NextResponse.json(
      { error: "Only the author or an Admin can delete this doc" },
      { status: 403 },
    );
  }

  await prisma.doc.delete({ where: { id: docId } });
  return NextResponse.json({ ok: true });
}
