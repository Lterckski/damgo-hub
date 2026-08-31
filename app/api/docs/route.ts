import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { serializeDoc } from "@/lib/docs";

// GET /api/docs — any authenticated member; ?projectId= filter.
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  const docs = await prisma.doc.findMany({
    where: projectId ? { projectId } : undefined,
    include: { author: { select: { displayName: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ docs: docs.map(serializeDoc) });
}

// POST /api/docs — any authenticated member creates a doc.
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const author = await getCurrentMember();
  const body = await request.json();
  const { title, content, projectId, driveFile } = body;

  if (typeof title !== "string" || title.trim() === "") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const doc = await prisma.doc.create({
    data: {
      title: title.trim(),
      content: typeof content === "string" ? content : "",
      authorId: author.id,
      projectId: typeof projectId === "string" ? projectId : null,
      // driveFile — { id, name, mimeType, url } from the Google Picker, or
      // omitted/null for a doc with no Drive link. All four columns are
      // set together — see doc.prisma.
      driveFileId: driveFile?.id ?? null,
      driveFileName: driveFile?.name ?? null,
      driveFileMimeType: driveFile?.mimeType ?? null,
      driveFileUrl: driveFile?.url ?? null,
    },
    include: { author: { select: { displayName: true } } },
  });

  return NextResponse.json({ doc: serializeDoc(doc) }, { status: 201 });
}
