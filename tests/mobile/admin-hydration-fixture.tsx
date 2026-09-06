import { AdminConsole } from "@/components/admin/admin-console";
import { ToastProvider } from "@/components/ui/toast";
import type { AdminStats } from "@/lib/admin/stats";
import type { AdminTableData } from "@/lib/admin/tables";
import type { SearchEntry } from "@/lib/admin/search";

const now = "2026-09-06T12:00:00.000Z";
const members: AdminTableData["members"] = Array.from(
  { length: 1000 },
  (_, index) => ({
    id: `member-${index}`,
    clerkUserId: `clerk-${index}`,
    displayName: `Member ${String(index + 1).padStart(4, "0")}`,
    email: `member-${index}@example.test`,
    avatarUrl: null,
    status: "ACTIVE",
    isLeader: index === 0,
    orgRole: index < 2 ? "org:admin" : "org:member",
    functionalRoles: index % 2 ? ["ENGINEERING"] : ["OPERATIONS"],
    workDistributionRoles: [],
    inClerkOrg: true,
    openPenaltyCount: index % 4,
    openTaskCount: index % 8,
    createdAt: now,
  }),
);

const tables: AdminTableData = {
  members,
  finance: [],
  penalties: [],
  projects: [],
  activity: [],
};

const searchIndex: SearchEntry[] = members.map((member) => ({
  id: `members:${member.id}`,
  group: "Members",
  title: member.displayName,
  subtitle: member.email,
  keywords: `${member.displayName} ${member.email}`.toLowerCase(),
  drawer: { kind: "members", recordId: member.id },
}));

const stats: AdminStats = {
  memberCountDegraded: false,
  cards: [
    {
      key: "members",
      label: "Total Members",
      value: "1000",
      breakdown: "1000 active · 0 pending",
      delta: "+12 this week",
      filter: { tab: "members", filterId: "all" },
      emptyHint: null,
      tone: "neutral",
    },
  ],
  exceptions: [],
};

/** Deterministic full admin console for SSR hydration tracing. */
export function AdminHydrationFixture() {
  return (
    <ToastProvider>
      <AdminConsole
        stats={stats}
        queue={[]}
        tables={tables}
        auditLog={[]}
        searchIndex={searchIndex}
        settings={{
          penaltyRules: [],
          penaltyDueDays: 14,
          financeCategories: ["Supplies", "Travel"],
          meetingCadence: "WEEKLY",
          invitePolicy: "ADMIN_ONLY",
          projectStaleDays: 14,
        }}
        reconciliation={null}
        reconciliationError={null}
        isLeader
        isViewingAsMember={false}
        currentMemberId="member-0"
      />
    </ToastProvider>
  );
}
