import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { PROJECT_INCLUDE, serializeProject } from "@/lib/projects";
import { BackButton } from "@/components/shared/back-button";
import { ProjectsList } from "@/components/projects/projects-list";

export default async function ProjectsPage() {
  const member = await getCurrentMember();

  const [myProjects, allProjects, memberRecords] = await Promise.all([
    prisma.project.findMany({
      where: { OR: [{ ownerId: member.id }, { members: { some: { memberId: member.id } } }] },
      include: PROJECT_INCLUDE,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.project.findMany({
      include: PROJECT_INCLUDE,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.member.findMany({ orderBy: { displayName: "asc" } }),
  ]);

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
          myProjects={myProjects.map(serializeProject)}
          allProjects={allProjects.map(serializeProject)}
          members={memberRecords.map((m) => ({ id: m.id, displayName: m.displayName, avatarUrl: m.avatarUrl }))}
          currentMemberId={member.id}
        />
      </div>
    </div>
  );
}
