import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import type { Member } from "@/app/generated/prisma/client";

/**
 * Resolves the active Clerk identity to its `Member` record — creating one
 * on first sign-in if it doesn't exist yet.
 *
 * This only covers profile data (name, email, avatar, status, isLeader,
 * role tags). Admin/member permission is Clerk's org role, never stored
 * here — use `isCurrentMemberAdmin()` / `isCurrentMemberLeader()` for that.
 */
export async function getCurrentMember(): Promise<Member> {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("getCurrentMember() called without an authenticated Clerk session");
  }

  const existing = await prisma.member.findUnique({
    where: { clerkUserId: userId },
  });

  if (existing) {
    return existing;
  }

  const user = await currentUser();
  const primaryEmail = user?.emailAddresses.find(
    (address) => address.id === user.primaryEmailAddressId,
  )?.emailAddress;

  return prisma.member.create({
    data: {
      clerkUserId: userId,
      email: primaryEmail ?? "",
      displayName: user?.fullName ?? user?.username ?? "New Member",
      avatarUrl: user?.imageUrl,
      status: "ACTIVE",
    },
  });
}

/**
 * Whether the current session holds the Clerk `org:admin` role — the
 * Leader or Assistant Leader. This is the only place that should read
 * `orgRole` for permission checks; every Admin-gated route/page calls
 * this instead of re-deriving it.
 */
export async function isCurrentMemberAdmin(): Promise<boolean> {
  const { orgRole } = await auth();
  return orgRole === "org:admin";
}

/**
 * Whether the current member is the org's Leader — the only person who
 * may grant or revoke the Assistant Leader's `org:admin` seat. Distinct
 * from `isCurrentMemberAdmin()`: the Assistant Leader is also an admin
 * but is not the Leader.
 */
export async function isCurrentMemberLeader(): Promise<boolean> {
  const member = await getCurrentMember();
  return member.isLeader;
}
