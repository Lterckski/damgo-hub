import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getCurrentMember, isCurrentMemberAdmin, isCurrentMemberLeader } from "@/lib/current-member";
import { MissingReasonError } from "@/lib/audit-log";
import type { AuditActor } from "@/lib/audit-log";

/**
 * Server-side authorization for every admin console mutation.
 *
 * Part 3's rule, restated: hiding a button is not access control. The
 * console renders inline role selects, override forms, and bulk actions
 * that a non-admin never sees — but every route behind them re-derives the
 * Clerk role here rather than trusting that the UI was the only way in.
 *
 * Returns a discriminated result instead of throwing, so a route handler
 * reads as a plain early return and can't forget to send a response.
 */

export interface AdminContext {
  actor: AuditActor;
  isLeader: boolean;
  orgId: string;
}

export type AdminGuardResult =
  | { ok: true; context: AdminContext }
  | { ok: false; response: NextResponse };

export async function requireAdmin(): Promise<AdminGuardResult> {
  const { userId, orgId } = await auth();

  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  // isCurrentMemberAdmin() respects the "View as role" toggle, on purpose:
  // an admin simulating a member should be refused by the API too, or the
  // toggle only proves the UI hides things and not that the server denies
  // them (Part 2's entire reason for the toggle existing).
  const [isAdmin, member, isLeader] = await Promise.all([
    isCurrentMemberAdmin(),
    getCurrentMember(),
    isCurrentMemberLeader(),
  ]);

  if (!isAdmin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Admins only" }, { status: 403 }),
    };
  }

  if (!orgId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No active organization" }, { status: 400 }),
    };
  }

  return {
    ok: true,
    context: {
      actor: { id: member.id, displayName: member.displayName, clerkUserId: member.clerkUserId },
      isLeader,
      orgId,
    },
  };
}

/**
 * Same, for the Leader-only actions (granting/revoking the Assistant
 * Leader's org:admin seat — see context/team-roster.md).
 */
export async function requireLeader(): Promise<AdminGuardResult> {
  const result = await requireAdmin();
  if (!result.ok) return result;

  if (!result.context.isLeader) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Only the Leader can do this" }, { status: 403 }),
    };
  }

  return result;
}

/** Maps a thrown MissingReasonError to a 400 so routes don't each re-catch it. */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof MissingReasonError) {
    return NextResponse.json({ error: "A reason is required for this action" }, { status: 400 });
  }
  console.error("Admin action failed", error);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
