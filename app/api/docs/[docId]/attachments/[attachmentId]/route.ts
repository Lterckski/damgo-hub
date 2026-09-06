import { getHubViewer } from "@/lib/hub/context";
import { visibleRecord } from "@/lib/hub/search";
import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { get } from "@vercel/blob";

import { prisma } from "@/lib/prisma";

// GET /api/docs/[docId]/attachments/[attachmentId] — streams an attachment
// to any authenticated member. Same authenticated-proxy pattern as
// 07-financial-tracker.md's receipt route — never a raw Blob URL.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ docId: string; attachmentId: string }> },
) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { docId, attachmentId } = await params;
  if (!(await visibleRecord(await getHubViewer(), `document:${docId}`)))
    return NextResponse.json(
      { error: "Document unavailable" },
      { status: 404 },
    );
  const attachment = await prisma.docAttachment.findUnique({
    where: { id: attachmentId, docId },
  });

  if (!attachment) {
    return NextResponse.json(
      { error: "Attachment not found" },
      { status: 404 },
    );
  }

  const blob = await get(attachment.filePath, { access: "private" });
  if (!blob?.stream) {
    return NextResponse.json(
      { error: "Attachment not found in storage" },
      { status: 404 },
    );
  }

  return new NextResponse(blob.stream, {
    headers: {
      "Content-Type": blob.blob.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${attachment.fileName}"`,
    },
  });
}
