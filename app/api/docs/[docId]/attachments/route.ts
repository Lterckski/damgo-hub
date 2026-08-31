import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { put } from "@vercel/blob";

import { prisma } from "@/lib/prisma";
import { serializeAttachment } from "@/lib/docs";

// POST /api/docs/[docId]/attachments — any authenticated member; uploads a
// file to a private Vercel Blob and creates the DocAttachment record.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ docId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { docId } = await params;
  const doc = await prisma.doc.findUnique({ where: { id: docId } });
  if (!doc) {
    return NextResponse.json({ error: "Doc not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const blob = await put(`docs/${docId}-${Date.now()}-${file.name}`, file, {
    access: "private",
    addRandomSuffix: true,
  });

  const attachment = await prisma.docAttachment.create({
    data: { docId, fileName: file.name, filePath: blob.pathname },
  });

  return NextResponse.json({ attachment: serializeAttachment(attachment) }, { status: 201 });
}
