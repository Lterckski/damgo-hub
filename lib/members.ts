import { listOrgRoles } from "@/lib/organization-roles";
import { prisma } from "@/lib/prisma";
import type { MemberRow } from "@/components/members/member-directory-table";

export interface MemberPickerOption {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * Fresh picker options for the active Clerk organization. The Clerk roster
 * is reconciled before the database query, so a newly accepted member is
 * available on the next render without first visiting Damgo Hub themself.
 */
export async function getMemberPickerOptions(): Promise<MemberPickerOption[]> {
  const orgRoles = await listOrgRoles();

  return prisma.member.findMany({
    where: { clerkUserId: { in: [...orgRoles.keys()] } },
    select: { id: true, displayName: true, avatarUrl: true },
    orderBy: { displayName: "asc" },
  });
}

/**
 * The exact roster rows `MemberDirectoryTable` renders — extracted so
 * `/members` and `/admin/members` (20-admin-dashboard.md's "deep link
 * into the existing Member Tracker; reuse that page's table component
 * rather than rebuilding it") can share one query instead of two copies.
 * The table itself already adapts to `isAdmin`, so both routes render
 * identically for an admin — the only difference is which nav got you
 * there.
 */
export async function getMemberTrackerRows(): Promise<MemberRow[]> {
  const orgRoles = await listOrgRoles();

  const members = await prisma.member.findMany({
    where: { clerkUserId: { in: [...orgRoles.keys()] } },
    include: { functionalRoles: true, workDistributionRoles: true },
    orderBy: { createdAt: "asc" },
  });

  return members.map((member) => ({
    id: member.id,
    displayName: member.displayName,
    email: member.email,
    avatarUrl: member.avatarUrl,
    status: member.status,
    isLeader: member.isLeader,
    orgRole: orgRoles.get(member.clerkUserId) ?? "org:member",
    functionalRoles: member.functionalRoles.map((r) => r.role),
    workDistributionRoles: member.workDistributionRoles.map((r) => r.role),
    createdAt: member.createdAt.toISOString(),
  }));
}
