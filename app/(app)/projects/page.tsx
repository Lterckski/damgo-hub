import { entityVisibilityWhere } from "@/lib/hub/context";
import { requireWorkspacePage as requireWorkspaceSession } from "@/lib/hub/context";
import { prisma } from "@/lib/prisma";
import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import { getMemberPickerOptions } from "@/lib/members";
import { PROJECT_INCLUDE, serializeProject } from "@/lib/projects";
import { BackButton } from "@/components/shared/back-button";
import { ProjectsList } from "@/components/projects/projects-list";

export default async function ProjectsPage() {
  await requireWorkspaceSession();

  const member = await getCurrentMember();

  // myProjects is always a strict subset of allProjects (every project the
  // member owns or collaborates on is, definitionally, also "all
  // projects") — this used to run as two separate findMany calls with the
  // same PROJECT_INCLUDE join, doubling this page's query cost for no
  // reason. Fetch once, derive the subset in JS instead.
  const [allProjectRecords, memberRecords, isAdmin] = await Promise.all([
    prisma.project.findMany({
      where: await entityVisibilityWhere("project"),
      include: PROJECT_INCLUDE,
      orderBy: { updatedAt: "desc" },
    }),
    getMemberPickerOptions(),
    isCurrentMemberAdmin(),
  ]);

  const allProjects = allProjectRecords.map(serializeProject);
  const myProjects = allProjects.filter(
    (p) => p.ownerId === member.id || p.members.some((m) => m.id === member.id),
  );
  // The org-wide queue of proposals still awaiting an admin decision. Same
  // single fetch as the other two views — deriving the subset in JS keeps
  // this page at one project query, per the server-latency work.
  const proposedProjects = allProjects.filter((p) => p.status === "PROPOSED");

  return (
    <div className="p-6">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="font-display text-3xl text-copy-primary">Projects</h1>
      </div>
      <p className="mt-1 text-sm text-copy-secondary">
        Proposals, ownership, and who&apos;s collaborating on what.
      </p>

      <div className="mt-6">
        <ProjectsList
          myProjects={myProjects}
          proposedProjects={proposedProjects}
          allProjects={allProjects}
          members={memberRecords}
          currentMemberId={member.id}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  );
}
