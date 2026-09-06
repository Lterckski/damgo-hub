import type { MemberStatus } from "@/app/generated/prisma/client";

/**
 * Display labels for `MemberStatus`. Shared so the member directory and the
 * admin console's Members tab can't drift apart on what REMOVED reads as —
 * the whole reason that value exists is to be visible rather than silently
 * folded into a count.
 */
export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  REMOVED: "Removed",
};

/** Statuses an admin can set from the UI. REMOVED is set only by the Clerk sync action. */
export const ASSIGNABLE_MEMBER_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export type AssignableMemberStatus = (typeof ASSIGNABLE_MEMBER_STATUSES)[number];

export function isAssignableMemberStatus(value: unknown): value is AssignableMemberStatus {
  return typeof value === "string" && (ASSIGNABLE_MEMBER_STATUSES as readonly string[]).includes(value);
}
