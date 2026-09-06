import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getHubViewer, requireWorkspacePage } from "@/lib/hub/context";
import { visibleRecord } from "@/lib/hub/search";
import { RecordOpenTracker } from "@/components/chrome/record-open-tracker";
import { RecordActions } from "@/components/chrome/record-actions";
import { MarkdownContent } from "@/components/docs/markdown-content";
import { getMemberPickerOptions } from "@/lib/members";

export default async function RecordPage({
  params,
}: {
  params: Promise<{ recordId: string }>;
}) {
  await requireWorkspacePage();
  const viewer = await getHubViewer();
  const { recordId } = await params;
  const record = await visibleRecord(viewer, recordId);
  if (!record) notFound();
  const [comments, members, milestones] = await Promise.all([
    prisma.hubComment.findMany({
      where: { recordId },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    getMemberPickerOptions(),
    record.entityType === "project"
      ? prisma.projectMilestone.findMany({
          where: { projectId: record.entityId },
          orderBy: { dueAt: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const destinations: Record<string, string> = {
    task: `/tasks?task=${record.entityId}`,
    penalty: "/penalties",
    transaction: "/finance",
    project: `/projects/${record.entityId}`,
    meeting: `/meetings/${record.entityId}`,
    document: `/docs/${record.entityId}`,
    idea: `/ideas?idea=${record.entityId}`,
    member: "/members",
    announcement: "/dashboard",
    broadcast: "/dashboard",
  };
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-5 sm:p-8">
      <RecordOpenTracker id={record.id} />
      <div>
        <Link href="/dashboard" className="text-sm text-brand hover:underline">
          ← Dashboard
        </Link>
        <p className="mt-6 text-xs font-bold uppercase tracking-wider text-copy-secondary">
          {record.entityType} · {record.status}
        </p>
        <h1 className="mt-2 font-display text-3xl text-copy-primary">
          {record.title}
        </h1>
        {record.dueAt && (
          <p className="mt-2 text-sm text-copy-secondary">
            {record.dueAt.toLocaleString("en-PH", {
              timeZone: "Asia/Manila",
              dateStyle: "medium",
              timeStyle: "short",
            })}{" "}
            (Philippine time)
          </p>
        )}
      </div>
      <section className="rounded-2xl border border-surface-border bg-surface p-6">
        <MarkdownContent content={record.body || "No additional details."} />
      </section>
      <Link
        href={destinations[record.entityType] ?? "/dashboard"}
        className="inline-block text-sm font-medium text-brand hover:underline"
      >
        Open in{" "}
        {record.entityType === "document"
          ? "Docs"
          : record.entityType === "idea"
            ? "Ideas board"
            : "workspace"}{" "}
        →
      </Link>
      <RecordActions
        recordId={record.id}
        entityType={record.entityType}
        status={record.status}
        isAdmin={viewer.role === "org:admin"}
        isOwner={record.ownerId === viewer.memberId}
        canManageProject={viewer.projectIds.includes(record.entityId)}
        members={members}
        comments={comments.map((c) => ({
          id: c.id,
          body: c.body,
          authorName:
            members.find((m) => m.id === c.authorId)?.displayName ??
            "Former member",
          createdAt: c.createdAt.toISOString(),
        }))}
        milestones={milestones.map((m) => ({
          id: m.id,
          title: m.title,
          dueAt: m.dueAt.toISOString(),
          completed: !!m.completedAt,
          blockedReason: m.blockedReason,
        }))}
      />
    </div>
  );
}
