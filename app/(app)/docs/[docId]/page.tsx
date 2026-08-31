import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import { serializeAttachment, serializeDoc } from "@/lib/docs";
import { DocDetail } from "@/components/docs/doc-detail";

export default async function DocDetailPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const { docId } = await params;

  const [docRecord, currentMember, isAdmin] = await Promise.all([
    prisma.doc.findUnique({
      where: { id: docId },
      include: { author: true, attachments: { orderBy: { createdAt: "asc" } } },
    }),
    getCurrentMember(),
    isCurrentMemberAdmin(),
  ]);

  if (!docRecord) notFound();

  const doc = serializeDoc(docRecord);
  const canEdit = doc.authorId === currentMember.id || isAdmin;
  const attachments = docRecord.attachments.map(serializeAttachment);

  return <DocDetail doc={doc} attachments={attachments} canEdit={canEdit} />;
}
