import { prisma } from "@/lib/prisma";
import { listOrgRoles } from "@/lib/organization-roles";
import { getCurrentMember, isCurrentMemberAdmin, isCurrentMemberLeader } from "@/lib/current-member";
import { BackButton } from "@/components/shared/back-button";
import {
  MemberDirectoryTable,
  type MemberRow,
} from "@/components/members/member-directory-table";

export default async function MembersPage() {
  const orgRoles = await listOrgRoles();
  const [members, isAdmin, isLeader, currentMember] = await Promise.all([
    prisma.member.findMany({
      where: { clerkUserId: { in: [...orgRoles.keys()] } },
      include: { functionalRoles: true, workDistributionRoles: true },
      orderBy: { createdAt: "asc" },
    }),
    isCurrentMemberAdmin(),
    isCurrentMemberLeader(),
    getCurrentMember(),
  ]);

  const rows: MemberRow[] = members.map((member) => ({
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

  return (
    <div className="p-6">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="font-display text-3xl text-copy-primary">Member Tracker</h1>
      </div>
      <p className="mt-1 text-sm text-copy-secondary">
        The organization roster — roles, status, and contribution tags.
      </p>
      <div className="mt-6">
        <MemberDirectoryTable
          members={rows}
          isAdmin={isAdmin}
          isLeader={isLeader}
          currentMemberId={currentMember.id}
        />
      </div>
    </div>
  );
}
