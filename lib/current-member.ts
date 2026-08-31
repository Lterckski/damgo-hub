import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidateTag } from "next/cache";
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

  const created = await prisma.member.create({
    data: {
      clerkUserId: userId,
      email: primaryEmail ?? "",
      displayName: user?.fullName ?? user?.username ?? "New Member",
      avatarUrl: user?.imageUrl,
      status: "ACTIVE",
    },
  });

  // A new member changes the cached picker list (lib/members.ts) — the
  // only other write path to displayName/avatarUrl, since nothing updates
  // an existing member's name/avatar today. { expire: 0 } — Next 16's
  // revalidateTag now requires this second argument; 0 means "gone
  // immediately, no stale-while-revalidate window" since this can run
  // from many call sites (not just Server Actions, where updateTag would
  // be the alternative) and a just-created member should be pickable
  // right away, not eventually.
  revalidateTag("members", { expire: 0 });

  return created;
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
