import { RecordOpenTracker } from "@/components/chrome/record-open-tracker";
import { entityVisibilityWhere } from "@/lib/hub/context";
import { requireWorkspacePage as requireWorkspaceSession } from "@/lib/hub/context";
import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { getMemberPickerOptions } from "@/lib/members";
import { PROJECT_INCLUDE, serializeProject } from "@/lib/projects";
import { AccessDenied } from "@/components/shared/access-denied";
import { ProjectDetail } from "@/components/projects/project-detail";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  await requireWorkspaceSession();

  const [{ projectId }, member, visibility, allMembers] = await Promise.all([
    params,
    getCurrentMember(),
    entityVisibilityWhere("project"),
    getMemberPickerOptions(),
  ]);
  const projectRecord = await prisma.project.findUnique({
    where: { id: projectId, AND: [visibility] },
    include: PROJECT_INCLUDE,
  });

  if (!projectRecord) {
    return <AccessDenied backHref="/projects" backLabel="Back to Projects" />;
  }
  const access =
    projectRecord.ownerId === member.id
      ? "owner"
      : projectRecord.members.some(({ member: collaborator }) =>
            collaborator.id === member.id
          )
        ? "collaborator"
        : null;
  if (!access) {
    return <AccessDenied backHref="/projects" backLabel="Back to Projects" />;
  }

  return (
    <>
      <RecordOpenTracker id={`project:${projectId}`} />{" "}
      <ProjectDetail
        project={serializeProject(projectRecord)}
        allMembers={allMembers}
        isOwner={access === "owner"}
      />
    </>
  );
}
