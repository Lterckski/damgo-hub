import { clerkClient } from "@clerk/nextjs/server";
import { cache } from "react";

import { organizationMemberProfile } from "@/lib/member-profile";

export interface ClerkOrgMemberProfile {
  clerkUserId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
}

export interface ClerkPendingInvitation {
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

/** One request-scoped, fully paginated Clerk roster for every consumer. */
export const getClerkOrgMembers = cache(
  async (orgId: string): Promise<ClerkOrgMemberProfile[]> => {
    const client = await clerkClient();
    const limit = 100;
    const first = await client.organizations.getOrganizationMembershipList({
      organizationId: orgId,
      limit,
      offset: 0,
    });
    const offsets = Array.from(
      { length: Math.max(0, Math.ceil(first.totalCount / limit) - 1) },
      (_, index) => (index + 1) * limit,
    );
    const remaining = await Promise.all(
      offsets.map((offset) =>
        client.organizations.getOrganizationMembershipList({
          organizationId: orgId,
          limit,
          offset,
        }),
      ),
    );

    return [first, ...remaining].flatMap(({ data }) =>
      data.flatMap((membership) => {
        if (!membership.publicUserData) return [];
        return [
          {
            ...organizationMemberProfile(membership.publicUserData),
            role: membership.role,
          },
        ];
      }),
    );
  },
);

export const getClerkPendingInvitations = cache(
  async (orgId: string): Promise<ClerkPendingInvitation[]> => {
    const client = await clerkClient();
    const limit = 100;
    const first = await client.organizations.getOrganizationInvitationList({
      organizationId: orgId,
      limit,
      offset: 0,
    });
    const offsets = Array.from(
      { length: Math.max(0, Math.ceil(first.totalCount / limit) - 1) },
      (_, index) => (index + 1) * limit,
    );
    const remaining = await Promise.all(
      offsets.map((offset) =>
        client.organizations.getOrganizationInvitationList({
          organizationId: orgId,
          limit,
          offset,
        }),
      ),
    );
    return [first, ...remaining]
      .flatMap(({ data }) => data)
      .filter((invitation) => invitation.status === "pending")
      .map((invitation) => ({
        email: invitation.emailAddress,
        role: invitation.role,
        status: invitation.status ?? "pending",
        createdAt: new Date(invitation.createdAt).toISOString(),
      }));
  },
);
