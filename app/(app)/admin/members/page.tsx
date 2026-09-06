import { requireWorkspacePage as requireWorkspaceSession } from "@/lib/hub/context";
import { getCurrentMember, isCurrentMemberLeader } from "@/lib/current-member";
import { getMemberTrackerRows } from "@/lib/members";
import { BackButton } from "@/components/shared/back-button";
import { MemberDirectoryTable } from "@/components/members/member-directory-table";

// Deep link into the existing Member Tracker — see 20-admin-dashboard.md.
// Reuses MemberDirectoryTable and its data query as-is (via
// getMemberTrackerRows()) rather than rebuilding an admin-only copy; the
// table already adapts to isAdmin (which is always true here, this route
// is admin-gated by app/(app)/admin/layout.tsx).
export default async function AdminMembersPage() {
  await requireWorkspaceSession();

  const [rows, isLeader, currentMember] = await Promise.all([
    getMemberTrackerRows(),
    isCurrentMemberLeader(),
    getCurrentMember(),
  ]);

  return (
    <div className="p-6">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="font-display text-3xl text-copy-primary">Members</h1>
      </div>
      <p className="mt-1 text-sm text-copy-secondary">
        The organization roster — roles, status, and contribution tags.
      </p>
      <div className="mt-6">
        <MemberDirectoryTable
          members={rows}
          isAdmin
          isLeader={isLeader}
          currentMemberId={currentMember.id}
        />
      </div>
    </div>
  );
}
