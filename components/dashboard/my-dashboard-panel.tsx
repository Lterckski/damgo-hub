import type {
  ActivityRow,
  MyMoney,
  MyPenaltyRow,
  MyProjectRow,
  MyTaskRow,
  TimelineItem,
  UrgentItem,
} from "@/lib/dashboard/types";
import { MyActivityCard } from "@/components/dashboard/my/my-activity-card";
import { MyMoneyCard } from "@/components/dashboard/my/my-money-card";
import { MyPenaltiesCard } from "@/components/dashboard/my/my-penalties-card";
import { MyProjectsCard } from "@/components/dashboard/my/my-projects-card";
import { MyTasksCard } from "@/components/dashboard/my/my-tasks-card";
import { NeedsYouToday } from "@/components/dashboard/my/needs-you-today";
import { UpcomingCard } from "@/components/dashboard/my/upcoming-card";
import { DashboardCaptureProvider } from "@/components/dashboard/my/dashboard-capture";

/**
 * My Dashboard.
 *
 * Deliberately *not* a uniform grid. Sizes carry meaning:
 *
 *   - Needs You Today spans the full width and collapses to one line when
 *     empty, so it costs nothing to say nothing is wrong.
 *   - My Tasks is the tallest card and gets 3 of 5 columns — it's the one
 *     people actually work from.
 *   - Upcoming and My Money sit beside it at 2 columns.
 *   - My Projects and My Activity are secondary, smaller and lower.
 *
 * Nothing here is admin-facing. Every query behind it is scoped to the
 * signed-in member server-side (lib/dashboard/personal.ts), so the tab
 * reads identically for the Leader and for someone with no elevated
 * permissions — Part 4's requirement, and the reason the team ledger and
 * approvals live on Team Overview and /admin instead.
 *
 * Quick Capture's shared state lives in a narrow client provider. The panel
 * itself and its read-only cards remain Server Components; interactive cards
 * opt into the client independently.
 */

export interface MyDashboardData {
  urgent: UrgentItem[];
  tasks: MyTaskRow[];
  upcoming: TimelineItem[];
  penalties: MyPenaltyRow[];
  money: MyMoney;
  projects: MyProjectRow[];
  activity: ActivityRow[];
  financeCategories: string[];
  ideasEnabled: boolean;
}

export function MyDashboardPanel({ data }: { data: MyDashboardData }) {
  return (
    <DashboardCaptureProvider
      financeCategories={data.financeCategories}
      ideasEnabled={data.ideasEnabled}
    >
      <div className="flex flex-col gap-4">

      {/* Row 1 — full width, collapses when clear. */}
      <NeedsYouToday items={data.urgent} />

      {/* Rows 2–3 — tasks dominate, upcoming beside it. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <MyTasksCard tasks={data.tasks} />
        </div>
        <div className="lg:col-span-2">
          <UpcomingCard items={data.upcoming} />
        </div>
      </div>

      {/* Rows 4–5 — money matters pair up, penalties wider. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <MyPenaltiesCard penalties={data.penalties} />
        </div>
        <div className="lg:col-span-2">
          <MyMoneyCard money={data.money} />
        </div>
      </div>

      {/* Rows 6–7 — secondary, equal weight, visually quieter. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MyProjectsCard projects={data.projects} />
        <MyActivityCard events={data.activity} />
      </div>
      </div>
    </DashboardCaptureProvider>
  );
}
