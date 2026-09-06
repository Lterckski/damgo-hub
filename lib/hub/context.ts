import { cache } from "react";
import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { listOrgRoles } from "@/lib/organization-roles";
import { isDevViewingAsMember } from "@/lib/current-member";
import type { Viewer } from "./visibility";
import { recordWhere } from "./visibility";

export class HubAccessError extends Error {
  constructor(
    message: string,
    public status = 403,
  ) {
    super(message);
  }
}

/** A deployment is bound to the seeded leader's verified organization,
 * never whichever organization an arbitrary first visitor selects. */
export const requireWorkspaceSession = cache(async () => {
  const session = await auth();
  if (!session.userId) throw new HubAccessError("Sign in to continue", 401);
  if (!session.orgId)
    throw new HubAccessError("Select your Damgo Hub organization", 403);
  const client = await clerkClient();
  let workspace = await prisma.hubWorkspace.findUnique({
    where: { id: "singleton" },
  });
  if (!workspace) {
    const leader = await prisma.member.findFirst({ where: { isLeader: true } });
    if (!leader)
      throw new HubAccessError(
        "Workspace organization has not been configured",
        503,
      );
    const configured = process.env.CLERK_ORGANIZATION_ID;
    let verifiedOrgId: string | undefined;
    if (configured) {
      const membership =
        await client.organizations.getOrganizationMembershipList({
          organizationId: configured,
          userId: [leader.clerkUserId],
          limit: 1,
        });
      if (
        membership.data.some(
          (m) => m.publicUserData?.userId === leader.clerkUserId,
        )
      )
        verifiedOrgId = configured;
    } else {
      const memberships = await client.users.getOrganizationMembershipList({
        userId: leader.clerkUserId,
        limit: 2,
      });
      if (memberships.totalCount === 1)
        verifiedOrgId = memberships.data[0]?.organization.id;
    }
    if (!verifiedOrgId) {
      throw new HubAccessError(
        "Set CLERK_ORGANIZATION_ID to the workspace's verified organization",
        503,
      );
    }
    workspace = await prisma.hubWorkspace.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", orgId: verifiedOrgId },
      update: {},
    });
    await prisma.hubRecord.updateMany({
      where: { orgId: "" },
      data: { orgId: workspace.orgId },
    });
  }
  if (workspace.orgId !== session.orgId)
    throw new HubAccessError(
      "This organization is not connected to this workspace",
    );
  const membership = await client.organizations.getOrganizationMembershipList({
    organizationId: session.orgId,
    userId: [session.userId],
    limit: 1,
  });
  const current = membership.data.find(
    (m) => m.publicUserData?.userId === session.userId,
  );
  if (!current)
    throw new HubAccessError("You are no longer a member of this organization");
  // Recover safely if the first bootstrap was interrupted after binding.
  await prisma.hubRecord.updateMany({
    where: { orgId: "" },
    data: { orgId: workspace.orgId },
  });
  return { userId: session.userId, orgId: session.orgId, role: current.role };
});

export async function requireWorkspacePage() {
  try {
    return await requireWorkspaceSession();
  } catch (error) {
    if (error instanceof HubAccessError)
      redirect(error.status === 401 ? "/sign-in" : "/workspace-access");
    throw error;
  }
}

export const getHubViewer = cache(async (): Promise<Viewer> => {
  const session = await requireWorkspaceSession();
  const roles = await listOrgRoles();
  const members = await prisma.member.findMany({
    where: {
      clerkUserId: { in: [...roles.keys()] },
      status: { not: "REMOVED" },
    },
    select: { id: true, clerkUserId: true },
  });
  const member = members.find((m) => m.clerkUserId === session.userId);
  if (!member) throw new HubAccessError("Your member profile is unavailable");
  await prisma.$transaction([
    prisma.hubMembership.deleteMany({
      where: {
        orgId: session.orgId,
        memberId: { notIn: members.map((m) => m.id) },
      },
    }),
    ...members.map((m) =>
      prisma.hubMembership.upsert({
        where: { memberId: m.id },
        create: {
          memberId: m.id,
          orgId: session.orgId,
          role: roles.get(m.clerkUserId)!,
        },
        update: { orgId: session.orgId, role: roles.get(m.clerkUserId)! },
      }),
    ),
  ]);
  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { ownerId: member.id },
        { members: { some: { memberId: member.id } } },
      ],
    },
    select: { id: true },
  });
  return {
    orgId: session.orgId,
    memberId: member.id,
    role: (await isDevViewingAsMember()) ? "org:member" : session.role,
    projectIds: projects.map((p) => p.id),
  };
});

export async function hubApiGuard(): Promise<Response | null> {
  try {
    await getHubViewer();
    return null;
  } catch (error) {
    if (error instanceof HubAccessError)
      return Response.json({ error: error.message }, { status: error.status });
    console.error("Workspace authorization unavailable", error);
    return Response.json(
      { error: "Unable to verify workspace access" },
      { status: 503 },
    );
  }
}

export async function taskVisibilityWhere() {
  return entityVisibilityWhere("task");
}

export async function entityVisibilityWhere(entityType: string) {
  const viewer = await getHubViewer();
  const records = await prisma.hubRecord.findMany({
    where: { ...recordWhere(viewer), entityType },
    select: { entityId: true },
  });
  return { id: { in: records.map((r) => r.entityId) } };
}

export async function activityVisibilityWhere() {
  const viewer = await getHubViewer();
  const records = await prisma.hubRecord.findMany({
    where: recordWhere(viewer),
    select: { entityId: true, entityType: true },
  });
  return {
    OR: records.map((r) => ({
      entityId: r.entityId,
      entityType: r.entityType.toUpperCase(),
    })),
  };
}
