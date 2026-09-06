import { requireWorkspacePage as requireWorkspaceSession } from "@/lib/hub/context";
import {
  getCurrentMember,
  isCurrentMemberAdmin,
  isCurrentMemberLeader,
} from "@/lib/current-member";
import { getMemberTrackerRows } from "@/lib/members";
import { BackButton } from "@/components/shared/back-button";
import { MemberDirectoryTable } from "@/components/members/member-directory-table";

export default async function MembersPage() {
  await requireWorkspaceSession();

  const [rows, isAdmin, isLeader, currentMember] = await Promise.all([
    getMemberTrackerRows(),
    isCurrentMemberAdmin(),
    isCurrentMemberLeader(),
    getCurrentMember(),
  ]);

  return (
    <div className="p-6">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="font-display text-3xl text-copy-primary">
          Member Tracker
        </h1>
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
