import { entityVisibilityWhere } from "@/lib/hub/context";
import { prisma } from "@/lib/prisma";
import type { Member } from "@/app/generated/prisma/client";

export type ProjectAccessLevel = "owner" | "collaborator";

/**
 * Whether `member` has any access to `projectId` — owner, an assigned
 * collaborator, or neither (`null`). Every project-scoped route and page
 * uses this instead of re-implementing the check inline — see
 * 11-project-proposals.md.
 */
export async function getProjectAccess(
  projectId: string,
  member: Member,
): Promise<ProjectAccessLevel | null> {
  const project = await prisma.project.findUnique({
    where: {
      ...{ id: projectId },
      AND: [await entityVisibilityWhere("project")],
    },
    select: {
      ownerId: true,
      members: { where: { memberId: member.id }, select: { id: true } },
    },
  });

  if (!project) return null;
  if (project.ownerId === member.id) return "owner";
  if (project.members.length > 0) return "collaborator";
  return null;
}

/**
 * Same as `getProjectAccess`, named for call sites that are enforcing
 * access rather than just checking it — still returns `null` on no access
 * rather than throwing, so routes can turn that into a `403` and pages can
 * render `AccessDenied` without a try/catch at every call site.
 */
export async function requireProjectAccess(
  projectId: string,
  member: Member,
): Promise<ProjectAccessLevel | null> {
  return getProjectAccess(projectId, member);
}
