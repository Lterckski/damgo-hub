import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { Member } from "@/app/generated/prisma/client";

// The dev "View as Member" toggle (components/chrome/dev-user-button.tsx)
// — a plain, unsigned cookie the client sets directly, deliberately safe
// to trust as-is because it can only ever *downgrade* a real admin to
// member view below, never grant admin to someone who isn't actually one.
// A non-admin setting this cookie has zero effect anywhere.
const DEV_VIEW_AS_MEMBER_COOKIE = "damgo_dev_view_as_member";

export async function isDevViewingAsMember(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(DEV_VIEW_AS_MEMBER_COOKIE)?.value === "1";
}

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

  // Another Server Component can reconcile the full Clerk roster during
  // this same first request. Upsert makes both paths race-safe.
  const created = await prisma.member.upsert({
    where: { clerkUserId: userId },
    update: {},
    create: {
      clerkUserId: userId,
      email: primaryEmail ?? "",
      displayName: user?.fullName ?? user?.username ?? "New Member",
      avatarUrl: user?.imageUrl,
      status: "ACTIVE",
    },
  });

  return created;
}

/**
 * Whether the current session holds the Clerk `org:admin` role — the
 * Leader or Assistant Leader. This is the only place that should read
 * `orgRole` for permission checks; every Admin-gated route/page calls
 * this instead of re-deriving it. Respects the dev "View as Member"
 * toggle — an admin with it active is treated as a regular member
 * everywhere, which is the entire point (verifying member-only behavior
 * actually behaves like it would for someone who really is one).
 */
export async function isCurrentMemberAdmin(): Promise<boolean> {
  const [{ orgRole }, viewingAsMember] = await Promise.all([auth(), isDevViewingAsMember()]);
  return orgRole === "org:admin" && !viewingAsMember;
}

/**
 * The real Clerk `org:admin` status, ignoring the dev "View as Member"
 * toggle. Only for that toggle's own UI
 * (components/chrome/dev-user-button.tsx) to decide whether to show/offer
 * it at all — every actual permission check should keep using
 * isCurrentMemberAdmin() above so it respects the simulated view.
 */
export async function isRealMemberAdmin(): Promise<boolean> {
  const { orgRole } = await auth();
  return orgRole === "org:admin";
}

/**
 * Whether the current member is the org's Leader — the only person who
 * may grant or revoke the Assistant Leader's `org:admin` seat. Distinct
 * from `isCurrentMemberAdmin()`: the Assistant Leader is also an admin
 * but is not the Leader. Also respects the dev "View as Member" toggle,
 * same reasoning as isCurrentMemberAdmin() above.
 */
export async function isCurrentMemberLeader(): Promise<boolean> {
  const [member, viewingAsMember] = await Promise.all([getCurrentMember(), isDevViewingAsMember()]);
  return member.isLeader && !viewingAsMember;
}
