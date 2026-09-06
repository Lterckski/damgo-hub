import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import {
  MyDashboardPanel,
  type MyDashboardData,
} from "@/components/dashboard/my-dashboard-panel";
import {
  TeamOverviewPanel,
  type TeamOverviewData,
} from "@/components/dashboard/team-overview-panel";
import { ToastProvider } from "@/components/ui/toast";

const soon = (hours: number) =>
  new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

const myData: MyDashboardData = {
  urgent: Array.from({ length: 6 }, (_, index) => ({
    id: `task:${index}`,
    kind: "OVERDUE_TASK" as const,
    title: `Hydration task ${index + 1}`,
    detail: "Fixture project",
    amountCents: null,
    tone: "critical" as const,
    at: soon(-24 - index),
    action: { label: "Complete", kind: "COMPLETE_TASK" as const },
  })),
  tasks: Array.from({ length: 40 }, (_, index) => ({
    id: `task-${index}`,
    title: `Assigned task ${String(index + 1).padStart(2, "0")}`,
    status: "TODO",
    priority: index % 3 === 0 ? "HIGH" : "MEDIUM",
    dueAt: soon(index + 1),
    bucket: index < 5 ? ("TODAY" as const) : ("THIS_WEEK" as const),
    projectName: "Performance project",
    assignedByName: "Fixture admin",
  })),
  upcoming: Array.from({ length: 18 }, (_, index) => ({
    id: `upcoming-${index}`,
    kind: index % 2 ? ("TASK_DUE" as const) : ("MEETING" as const),
    title: `Upcoming item ${index + 1}`,
    detail: "Fixture schedule",
    at: soon(index + 2),
    joinUrl: null,
    isMine: index % 3 === 0,
  })),
  penalties: [],
  money: {
    owedCents: 5000,
    owedBreakdown: { penaltiesCents: 5000, duesCents: 0 },
    owedToYouCents: 12000,
    owedToYouCount: 2,
    contributedCents: 15000,
    monthLabel: "September",
    asOf: "11:30 PM",
  },
  projects: Array.from({ length: 12 }, (_, index) => ({
    id: `project-${index}`,
    name: `Performance project ${index + 1}`,
    status: "ACTIVE",
    role: index % 2 ? "Owner" : "Collaborator",
    openTaskCount: index + 1,
    totalTaskCount: 20,
    completedTaskCount: index,
    nextMilestone: null,
    blockedReason: null,
  })),
  activity: Array.from({ length: 20 }, (_, index) => ({
    id: `activity-${index}`,
    type: "TASK_UPDATED",
    actorName: "Fixture member",
    summary: `Updated task ${index + 1}`,
    entityLabel: `Task ${index + 1}`,
    createdAt: soon(-index),
    isForYou: index % 2 === 0,
  })),
  financeCategories: ["Supplies", "Travel"],
  ideasEnabled: true,
};

const teamData: TeamOverviewData = {
  pulse: {
    nextMeeting: null,
    nearestDeadline: null,
    activeProjectCount: 12,
    activeMemberCount: 30,
    inactiveMemberCount: 2,
  },
  finance: {
    balanceCents: 250000,
    monthIncomeCents: 90000,
    monthExpenseCents: 25000,
    monthLabel: "September",
    pendingCount: 3,
    asOf: "11:30 PM",
    duesPeriodLabel: null,
    dues: [],
  },
  workload: [],
  projects: [],
  hackathons: [],
  ideas: [],
  ledger: [],
  activity: [],
  announcements: [],
  features: {
    ideasSnapshot: false,
    hackathons: false,
    announcements: false,
    dues: false,
  },
};

/** Deterministic dashboard surface for SSR hydration tracing. */
export function DashboardHydrationFixture() {
  return (
    <ToastProvider>
      <main className="p-6">
        <DashboardTabs
          greeting={<h1 className="font-display text-3xl">Dashboard trace</h1>}
          headerAction={null}
          myDashboard={<MyDashboardPanel data={myData} />}
          teamOverview={<TeamOverviewPanel data={teamData} />}
        />
      </main>
    </ToastProvider>
  );
}
