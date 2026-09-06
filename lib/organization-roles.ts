import { auth, clerkClient } from "@clerk/nextjs/server";
import { cache } from "react";

import { getClerkOrgMembers } from "@/lib/clerk-roster";
import { prisma } from "@/lib/prisma";

/**
 * Clerk organization-membership operations for the single Damgo Hub org.
 * Besides role changes, this module reconciles Clerk's current membership
 * list into the local Member table so selectors do not depend on every
 * teammate having opened Damgo Hub once first.
 */

async function getCurrentOrgId(): Promise<string> {
  const { orgId } = await auth();

  if (!orgId) {
    throw new Error("No active Clerk organization on this session");
  }

  return orgId;
}

/**
 * clerkUserId -> "org:admin" | "org:member" (or whatever role string Clerk
 * returns) for every member of the org.
 *
 * React cache deduplicates this work only within one server render. It does
 * not persist Clerk membership data between requests, so role revocation is
 * still observed on the next request.
 */
export const listOrgRoles = cache(async (): Promise<Map<string, string>> => {
  const orgId = await getCurrentOrgId();
  const profiles = await getClerkOrgMembers(orgId);
  const roles = new Map(
    profiles.map((profile) => [profile.clerkUserId, profile.role]),
  );

  const existingMembers = await prisma.member.findMany({
    where: {
      clerkUserId: { in: profiles.map((profile) => profile.clerkUserId) },
      status: { not: "REMOVED" },
    },
    select: {
      id: true,
      clerkUserId: true,
      email: true,
      displayName: true,
      avatarUrl: true,
    },
  });
  const existingByClerkId = new Map(existingMembers.map((member) => [member.clerkUserId, member]));
  const changedProfiles = profiles.filter((profile) => {
    const existing = existingByClerkId.get(profile.clerkUserId);
    return (
      !existing ||
      existing.email !== profile.email ||
      existing.displayName !== profile.displayName ||
      existing.avatarUrl !== profile.avatarUrl
    );
  });

  if (changedProfiles.length > 0) {
    await prisma.$transaction(
      changedProfiles.map((profile) =>
        prisma.member.upsert({
          where: { clerkUserId: profile.clerkUserId },
          update: {
            email: profile.email,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
          },
          create: {
            clerkUserId: profile.clerkUserId,
            email: profile.email,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            status: "ACTIVE",
          },
        }),
      ),
    );
  }

  const reconciledMembers = changedProfiles.length
    ? await prisma.member.findMany({
        where: {
          clerkUserId: { in: profiles.map((profile) => profile.clerkUserId) },
          status: { not: "REMOVED" },
        },
        select: { id: true, clerkUserId: true },
      })
    : existingMembers;
  await prisma.$transaction([
    prisma.hubMembership.deleteMany({ where: { orgId } }),
    prisma.hubMembership.createMany({
      data: reconciledMembers.map((member) => ({
        memberId: member.id,
        orgId,
        role: roles.get(member.clerkUserId)!,
      })),
    }),
  ]);

  return roles;
});

/** Grants org:admin to a member — the "Assign Assistant Leader" action. Caller must have already verified isCurrentMemberLeader(). */
export async function grantOrgAdmin(clerkUserId: string): Promise<void> {
  const orgId = await getCurrentOrgId();
  const client = await clerkClient();

  await client.organizations.updateOrganizationMembership({
    organizationId: orgId,
    userId: clerkUserId,
    role: "org:admin",
  });
}

/** Revokes org:admin from a member, demoting them to org:member — does not remove them from the org. Caller must have already verified isCurrentMemberLeader(). */
export async function revokeOrgAdmin(clerkUserId: string): Promise<void> {
  const orgId = await getCurrentOrgId();
  const client = await clerkClient();

  await client.organizations.updateOrganizationMembership({
    organizationId: orgId,
    userId: clerkUserId,
    role: "org:member",
  });
}

/**
 * Fully removes a member from the Clerk org (not just a role change) — the
 * Clerk-side half of deleting a member (see DELETE /api/members/[memberId]).
 * This has to happen: getCurrentMember() auto-creates a fresh Member row
 * for any signed-in Clerk user it doesn't recognize, so deleting only the
 * Postgres row while leaving them in the Clerk org would let them
 * "resurrect" as a brand-new, tag-less Member the next time they load any
 * page. Caller must have already verified isCurrentMemberAdmin().
 */
export async function removeMemberFromOrg(clerkUserId: string): Promise<void> {
  const orgId = await getCurrentOrgId();
  const client = await clerkClient();

  await client.organizations.deleteOrganizationMembership({
    organizationId: orgId,
    userId: clerkUserId,
  });
}
