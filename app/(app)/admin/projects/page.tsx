import { entityVisibilityWhere } from "@/lib/hub/context";
import { requireWorkspacePage as requireWorkspaceSession } from "@/lib/hub/context";
import { prisma } from "@/lib/prisma";
import { PROJECT_INCLUDE, serializeProject } from "@/lib/projects";
import { BackButton } from "@/components/shared/back-button";
import { AdminProjectsView } from "@/components/projects/admin-projects-view";

export default async function AdminProjectsPage() {
  await requireWorkspaceSession();

  const projectRecords = await prisma.project.findMany({
    where: await entityVisibilityWhere("project"),
    include: PROJECT_INCLUDE,
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="p-6">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="font-display text-3xl text-copy-primary">Projects</h1>
      </div>
      <p className="mt-1 text-sm text-copy-secondary">
        Every project proposal, regardless of ownership.
      </p>

      <div className="mt-6">
        <AdminProjectsView projects={projectRecords.map(serializeProject)} />
      </div>
    </div>
  );
}
