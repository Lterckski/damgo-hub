import { requireWorkspacePage as requireWorkspaceSession } from "@/lib/hub/context";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";

import { getCurrentMember } from "@/lib/current-member";
import { getOrgSettings } from "@/lib/org-settings";
import { getDashboardFeatures } from "@/lib/dashboard/features";
import { getRankedIdeas } from "@/lib/dashboard/ideas";
import {
  getMyActivity,
  getMyMoney,
  getMyPenalties,
  getMyProjects,
  getMyTasks,
  getNeedsYouToday,
  getUpcomingTimeline,
} from "@/lib/dashboard/personal";
import {
  getAnnouncements,
  getHackathonPipeline,
  getPenaltyLedger,
  getTeamActivity,
  getTeamFinance,
  getTeamProjects,
  getTeamPulse,
  getWorkload,
} from "@/lib/dashboard/team";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { MyDashboardPanel } from "@/components/dashboard/my-dashboard-panel";
import { TeamOverviewPanel } from "@/components/dashboard/team-overview-panel";
import { ToastProvider } from "@/components/ui/toast";

function PanelFallback() {
  return (
    <div className="flex min-h-[30vh] items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-copy-secondary" />
    </div>
  );
}

/**
 * The dashboard — see 06-dashboard-home.md and 22-dashboard-data-wiring.md.
 *
 * Rebuilt from a flat 2×2 grid of summary cards into two screens people
 * work from. What changed structurally:
 *
 *  - The header is one row: greeting, tabs and Quick Capture. It used to be
 *    an h1, a subtitle and then a tab strip, which spent roughly a third of
 *    the fold before any content.
 *  - Cards vary in size by importance instead of four equal boxes.
 *  - My Dashboard is genuinely personal. "Upcoming" and "Financial
 *    Snapshot" were team-wide queries sitting on a personal tab — the
 *    former shared one function with Team Overview, the latter showed the
 *    org balance. Both are fixed: the timeline marks what's yours, and the
 *    team balance moved to Team Overview where it belongs.
 *  - Nothing renders a card for a feature that isn't there (see
 *    lib/dashboard/features.ts).
 *
 * Both panels are still Suspense-wrapped so the hidden tab can't block the
 * visible one — the reason that boundary exists is unchanged.
 */
export default async function DashboardPage() {
  await requireWorkspaceSession();
  const member = await getCurrentMember();

  return (
    <ToastProvider>
      <div className="p-6 pb-24">
        <DashboardTabs
          greeting={
            <h1 className="font-display text-2xl text-copy-primary sm:text-3xl">
              Welcome back, {member.displayName.split(" ")[0]}
            </h1>
          }
          headerAction={null}
          myDashboard={
            <Suspense fallback={<PanelFallback />}>
              <MyDashboardSection memberId={member.id} />
            </Suspense>
          }
          teamOverview={
            <Suspense fallback={<PanelFallback />}>
              <TeamOverviewSection memberId={member.id} />
            </Suspense>
          }
        />
      </div>
    </ToastProvider>
  );
}

/**
 * Data-fetching wrappers, kept as their own async Server Components so each
 * panel streams independently. `memberId` comes from the Clerk session
 * resolved above — never from a prop the browser could set, which is what
 * makes the personal scoping in Part 4 actually hold.
 */
async function MyDashboardSection({ memberId }: { memberId: string }) {
  const [
    urgent,
    tasks,
    upcoming,
    penalties,
    money,
    projects,
    activity,
    settings,
    features,
  ] = await Promise.all([
    getNeedsYouToday(memberId),
    getMyTasks(memberId),
    getUpcomingTimeline(memberId),
    getMyPenalties(memberId),
    getMyMoney(memberId),
    getMyProjects(memberId),
    getMyActivity(memberId),
    getOrgSettings(),
    getDashboardFeatures(),
  ]);

  return (
    <MyDashboardPanel
      data={{
        urgent,
        tasks,
        upcoming,
        penalties,
        money,
        projects,
        activity,
        financeCategories: settings.financeCategories,
        ideasEnabled: features.ideasSnapshot,
      }}
    />
  );
}

async function TeamOverviewSection({ memberId }: { memberId: string }) {
  const [
    pulse,
    finance,
    workload,
    projects,
    hackathons,
    ideas,
    ledger,
    activity,
    announcements,
    features,
  ] = await Promise.all([
    getTeamPulse(),
    getTeamFinance(),
    getWorkload(),
    getTeamProjects(),
    getHackathonPipeline(),
    getRankedIdeas(memberId),
    getPenaltyLedger(),
    getTeamActivity(),
    getAnnouncements(memberId),
    getDashboardFeatures(),
  ]);

  return (
    <TeamOverviewPanel
      data={{
        pulse,
        finance,
        workload,
        projects,
        hackathons,
        ideas,
        ledger,
        activity,
        announcements,
        features,
      }}
    />
  );
}
