import { RecordOpenTracker } from "@/components/chrome/record-open-tracker";
import { entityVisibilityWhere } from "@/lib/hub/context";
import { requireWorkspacePage as requireWorkspaceSession } from "@/lib/hub/context";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import { serializeAttachment, serializeDoc } from "@/lib/docs";
import { DocDetail } from "@/components/docs/doc-detail";
import { MarkdownContent } from "@/components/docs/markdown-content";

export default async function DocDetailPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  await requireWorkspaceSession();

  const { docId } = await params;

  const [docRecord, currentMember, isAdmin] = await Promise.all([
    prisma.doc.findUnique({
      where: {
        ...{ id: docId },
        AND: [await entityVisibilityWhere("document")],
      },
      include: {
        author: { select: { displayName: true } },
        attachments: { orderBy: { createdAt: "asc" } },
      },
    }),
    getCurrentMember(),
    isCurrentMemberAdmin(),
  ]);

  if (!docRecord) notFound();

  const doc = serializeDoc(docRecord);
  const canEdit = doc.authorId === currentMember.id || isAdmin;
  const attachments = docRecord.attachments.map(serializeAttachment);

  return (
    <>
      <RecordOpenTracker id={`document:${docId}`} />
      <DocDetail
        doc={doc}
        attachments={attachments}
        canEdit={canEdit}
        renderedContent={<MarkdownContent content={doc.content} />}
      />
    </>
  );
}
