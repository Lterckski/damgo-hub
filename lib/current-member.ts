import { requireWorkspaceSession } from "@/lib/hub/context";
import { cookies } from "next/headers";
import { cache } from "react";
import { getCurrentMember } from "@/lib/member-session";

export { getCurrentMember } from "@/lib/member-session";

// The dev "View as Member" toggle (components/chrome/dev-user-button.tsx)
// — a plain, unsigned cookie the client sets directly, deliberately safe
// to trust as-is because it can only ever *downgrade* a real admin to
// member view below, never grant admin to someone who isn't actually one.
// A non-admin setting this cookie has zero effect anywhere.
const DEV_VIEW_AS_MEMBER_COOKIE = "damgo_dev_view_as_member";

export const isDevViewingAsMember = cache(async (): Promise<boolean> => {
  const cookieStore = await cookies();
  return cookieStore.get(DEV_VIEW_AS_MEMBER_COOKIE)?.value === "1";
});

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
  const [{ role: orgRole }, viewingAsMember] = await Promise.all([
    requireWorkspaceSession(),
    isDevViewingAsMember(),
  ]);
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
  const { role: orgRole } = await requireWorkspaceSession();
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
  const [member, viewingAsMember] = await Promise.all([
    getCurrentMember(),
    isDevViewingAsMember(),
  ]);
  return member.isLeader && !viewingAsMember;
}
