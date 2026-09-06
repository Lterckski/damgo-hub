import { cache } from "react";
import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/member-session";
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
  let workspace = await prisma.hubWorkspace.findUnique({
    where: { id: "singleton" },
  });
  if (!workspace) {
    const client = await clerkClient();
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
  if (!session.orgRole)
    throw new HubAccessError("You are no longer a member of this organization");
  return {
    userId: session.userId,
    orgId: session.orgId,
    role: session.orgRole,
  };
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
  const [session, member, viewingAsMember] = await Promise.all([
    requireWorkspaceSession(),
    getCurrentMember(),
    isDevViewingAsMember(),
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
    role: viewingAsMember ? "org:member" : session.role,
    projectIds: projects.map((p) => p.id),
  };
});

export async function hubApiGuard(): Promise<Response | null> {
  try {
    // API routes only need the deployment/org boundary here. Routes that
    // read scoped records resolve getHubViewer() through their visibility
    // helper, while routes without scoped records avoid roster sync and a
    // project lookup on every request.
    await requireWorkspaceSession();
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

/** Resolve several entity scopes with one HubRecord query. */
export async function entityVisibilityWheres(entityTypes: readonly string[]) {
  const viewer = await getHubViewer();
  const records = await prisma.hubRecord.findMany({
    where: {
      ...recordWhere(viewer),
      entityType: { in: [...new Set(entityTypes)] },
    },
    select: { entityId: true, entityType: true },
  });
  const ids = new Map<string, string[]>();
  for (const entityType of entityTypes) ids.set(entityType, []);
  for (const record of records) ids.get(record.entityType)?.push(record.entityId);
  return Object.fromEntries(
    entityTypes.map((entityType) => [
      entityType,
      { id: { in: ids.get(entityType) ?? [] } },
    ]),
  ) as Record<string, { id: { in: string[] } }>;
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
