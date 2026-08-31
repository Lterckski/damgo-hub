import { auth, clerkClient } from "@clerk/nextjs/server";

/**
 * Clerk organization-membership operations for the single Damgo Hub org.
 * Kept separate from lib/current-member.ts, which only resolves the
 * current session's own identity/profile — this module acts on other
 * members' Clerk roles, always gated by isCurrentMemberLeader() at the
 * call site (see 05-member-directory.md).
 */

async function getCurrentOrgId(): Promise<string> {
  const { orgId } = await auth();

  if (!orgId) {
    throw new Error("No active Clerk organization on this session");
  }

  return orgId;
}

/** clerkUserId -> "org:admin" | "org:member" (or whatever role string Clerk returns) for every member of the org. */
export async function listOrgRoles(): Promise<Map<string, string>> {
  const orgId = await getCurrentOrgId();
  const client = await clerkClient();

  const roles = new Map<string, string>();
  let offset = 0;
  const limit = 100;

  // Paginate — an org membership list can exceed a single page.
  while (true) {
    const { data } = await client.organizations.getOrganizationMembershipList(
      { organizationId: orgId, limit, offset },
    );

    for (const membership of data) {
      const clerkUserId = membership.publicUserData?.userId;
      if (clerkUserId) {
        roles.set(clerkUserId, membership.role);
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return roles;
}

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
