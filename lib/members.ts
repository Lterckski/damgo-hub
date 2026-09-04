import { listOrgRoles } from "@/lib/organization-roles";
import { prisma } from "@/lib/prisma";

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
