import { clerkClient } from "@clerk/nextjs/server";

import { requireProjectAccess } from "@/lib/project-access";
import type { Member } from "@/app/generated/prisma/client";

/**
 * Confirms the signed-in user is still a member of their active Clerk
 * organization. This must run before `getCurrentMember()`, since that helper
 * creates a local profile and a local profile is not proof of org membership.
 *
 * Shared by every route that authorizes access to a collaborative board room
 * (`/api/liveblocks-auth`, `/api/boards/[roomId]/snapshot`) so they enforce
 * the exact same check rather than two copies drifting apart.
 */
export async function hasVerifiedOrgMembership(userId: string, orgId: string): Promise<boolean> {
  const client = await clerkClient();
  const { data } = await client.organizations.getOrganizationMembershipList({
    organizationId: orgId,
    userId: [userId],
    limit: 1,
  });

  return data.some((membership) => membership.publicUserData?.userId === userId);
}

/**
 * Resolves a room ID to its collaboration surface and enforces that
 * surface's resource-level access rule. Same room ID convention as
 * 12-liveblocks-setup.md: `project:{id}` / `ideas` / an unrecognized prefix
 * denied by default.
 */
export async function memberHasRoomAccess(room: string, member: Member): Promise<boolean> {
  if (room === "ideas") {
    // Single global room, no suffix — any authenticated member passes.
    return true;
  }

  if (room.startsWith("project:")) {
    const projectId = room.slice("project:".length);
    const access = await requireProjectAccess(projectId, member);
    return access !== null;
  }

  // An unrecognized prefix isn't a surface this app knows about — deny
  // by default rather than falling through to an implicit allow.
  return false;
}
