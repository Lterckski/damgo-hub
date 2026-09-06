import { taskInclude } from "@/lib/hub/task-include";
import { entityVisibilityWhere } from "@/lib/hub/context";
import { taskVisibilityWhere } from "@/lib/hub/context";
import { requireWorkspacePage as requireWorkspaceSession } from "@/lib/hub/context";
import { prisma } from "@/lib/prisma";
import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import { getMemberPickerOptions } from "@/lib/members";
import { serializeTask } from "@/lib/tasks";
import { TASK_LINKABLE_PROJECT_STATUSES } from "@/lib/projects";
import { BackButton } from "@/components/shared/back-button";
import { TaskBoard } from "@/components/tasks/task-board";

export default async function TasksPage() {
  await requireWorkspaceSession();

  const [tasks, members, linkableProjects, docs, currentMember, isAdmin] =
    await Promise.all([
      prisma.task.findMany({
        where: await taskVisibilityWhere(),
        include: await taskInclude(),
        orderBy: { createdAt: "desc" },
      }),
      getMemberPickerOptions(),
      prisma.project.findMany({
        where: {
          ...{ status: { in: [...TASK_LINKABLE_PROJECT_STATUSES] } },
          AND: [await entityVisibilityWhere("project")],
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.doc.findMany({
        where: await entityVisibilityWhere("document"),
        select: { id: true, title: true, projectId: true },
        orderBy: { title: "asc" },
      }),
      getCurrentMember(),
      isCurrentMemberAdmin(),
    ]);

  return (
    <div className="p-6">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="font-display text-3xl text-copy-primary">Tasks</h1>
      </div>
      <p className="mt-1 text-sm text-copy-secondary">
        What&apos;s assigned, to whom, and where it stands.
      </p>

      <div className="mt-6">
        <TaskBoard
          tasks={tasks.map(serializeTask)}
          members={members.map((m) => ({
            id: m.id,
            displayName: m.displayName,
            avatarUrl: m.avatarUrl,
          }))}
          projects={linkableProjects}
          docs={docs}
          currentMemberId={currentMember.id}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  );
}
