import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidateTag, unstable_cache } from "next/cache";

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

// Internal, cached — unstable_cache's callback can't call auth() itself
// (that's a dynamic API, disallowed inside a cached function), so orgId
// comes in as a plain argument from listOrgRoles() below instead. Returns
// a plain Record, not a Map — Maps aren't reliably cache-serializable,
// where a plain object is. This is genuinely worth caching: it's a real
// network round trip to Clerk's API (paginated, potentially several
// requests), not just a DB query, and it changes only when someone's role
// actually changes (see the revalidateTag calls in grantOrgAdmin/
// revokeOrgAdmin/removeMemberFromOrg below — every write path here).
const getCachedOrgRoles = unstable_cache(
  async (orgId: string): Promise<Record<string, string>> => {
    const client = await clerkClient();
    const roles: Record<string, string> = {};
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
          roles[clerkUserId] = membership.role;
        }
      }

      if (data.length < limit) break;
      offset += limit;
    }

    return roles;
  },
  ["org-roles"],
  { tags: ["org-roles"] },
);

/** clerkUserId -> "org:admin" | "org:member" (or whatever role string Clerk returns) for every member of the org. */
export async function listOrgRoles(): Promise<Map<string, string>> {
  const orgId = await getCurrentOrgId();
  const roles = await getCachedOrgRoles(orgId);
  return new Map(Object.entries(roles));
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
  revalidateTag("org-roles", { expire: 0 });
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
  revalidateTag("org-roles", { expire: 0 });
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
  revalidateTag("org-roles", { expire: 0 });
}
