import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { getMemberPickerOptions } from "@/lib/members";
import { requireProjectAccess } from "@/lib/project-access";
import { PROJECT_INCLUDE, serializeProject } from "@/lib/projects";
import { AccessDenied } from "@/components/shared/access-denied";
import { ProjectDetail } from "@/components/projects/project-detail";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const member = await getCurrentMember();

  const access = await requireProjectAccess(projectId, member);
  if (!access) {
    return <AccessDenied backHref="/projects" backLabel="Back to Projects" />;
  }

  const [projectRecord, allMembers] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, include: PROJECT_INCLUDE }),
    getMemberPickerOptions(),
  ]);

  // Shouldn't happen — requireProjectAccess already confirmed the project
  // exists — but the type system doesn't know that.
  if (!projectRecord) {
    return <AccessDenied backHref="/projects" backLabel="Back to Projects" />;
  }

  return (
    <ProjectDetail
      project={serializeProject(projectRecord)}
      allMembers={allMembers}
      isOwner={access === "owner"}
    />
  );
}
