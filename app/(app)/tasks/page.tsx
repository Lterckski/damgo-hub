import { taskIncludeWithVisibility } from "@/lib/hub/task-include";
import { entityVisibilityWheres } from "@/lib/hub/context";
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

  const [members, currentMember, isAdmin, visibility] = await Promise.all([
    getMemberPickerOptions(),
    getCurrentMember(),
    isCurrentMemberAdmin(),
    entityVisibilityWheres(["task", "project", "document"]),
  ]);
  const include = taskIncludeWithVisibility(
    visibility.project,
    visibility.document,
  );

  const [tasks, linkableProjects, docs] =
    await Promise.all([
      prisma.task.findMany({
        where: visibility.task,
        include,
        orderBy: { createdAt: "desc" },
      }),
      prisma.project.findMany({
        where: {
          ...{ status: { in: [...TASK_LINKABLE_PROJECT_STATUSES] } },
          AND: [visibility.project],
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.doc.findMany({
        where: visibility.document,
        select: { id: true, title: true, projectId: true },
        orderBy: { title: "asc" },
      }),
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
