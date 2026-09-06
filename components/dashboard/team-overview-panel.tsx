"use client";

import type { RankedIdea } from "@/lib/dashboard/ideas";
import type {
  AnnouncementRow,
  HackathonRow,
  LedgerRow,
  TeamFinance,
  TeamPulse as TeamPulseData,
  TeamProjectRow,
  WorkloadRow,
} from "@/lib/dashboard/team";
import type { ActivityRow } from "@/lib/dashboard/types";
import type { DashboardFeatures } from "@/lib/dashboard/features";
import { ActivityFeedCard } from "@/components/dashboard/team/activity-feed-card";
import { AnnouncementsStrip } from "@/components/dashboard/team/announcements-strip";
import { HackathonCard } from "@/components/dashboard/team/hackathon-card";
import { IdeasCard } from "@/components/dashboard/team/ideas-card";
import { PenaltyLedgerCard } from "@/components/dashboard/team/penalty-ledger-card";
import { TeamFinanceCard } from "@/components/dashboard/team/team-finance-card";
import { TeamProjectsCard } from "@/components/dashboard/team/team-projects-card";
import { TeamPulse } from "@/components/dashboard/team/team-pulse";
import { WorkloadCard } from "@/components/dashboard/team/workload-card";

/**
 * Team Overview — read-mostly (Part 4). The only two things a member can
 * change here are an idea vote and dismissing an announcement for
 * themselves; everything that mutates shared state lives in /admin.
 *
 * Like My Dashboard, the layout is weighted rather than uniform: Pulse is
 * a thin strip, Finance is the widest card because dues status is the most
 * asked-about thing on the tab, and Hackathon/Ideas/Ledger/Activity are
 * secondary.
 *
 * Hackathon and Ideas render only when their feature flags allow it, so
 * the tab never shows a card advertising something that isn't there.
 */

export interface TeamOverviewData {
  pulse: TeamPulseData;
  finance: TeamFinance;
  workload: WorkloadRow[];
  projects: TeamProjectRow[];
  hackathons: HackathonRow[];
  ideas: RankedIdea[];
  ledger: LedgerRow[];
  activity: ActivityRow[];
  announcements: AnnouncementRow[];
  features: DashboardFeatures;
}

export function TeamOverviewPanel({ data }: { data: TeamOverviewData }) {
  const showHackathons = data.features.hackathons && data.hackathons.length > 0;
  const showIdeas = data.features.ideasSnapshot;

  return (
    <div className="flex flex-col gap-4">
      {/* Row 9 sits at the top, not the bottom: an announcement nobody
          scrolls to is an announcement nobody reads. It renders nothing
          when there's nothing pinned, so it costs no space. */}
      <AnnouncementsStrip announcements={data.announcements} />

      <TeamPulse pulse={data.pulse} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <TeamFinanceCard finance={data.finance} />
        </div>
        <div className="lg:col-span-2">
          <WorkloadCard rows={data.workload} />
        </div>
      </div>

      <TeamProjectsCard projects={data.projects} />

      {(showHackathons || showIdeas) && (
        <div
          className={
            showHackathons && showIdeas
              ? "grid grid-cols-1 gap-4 lg:grid-cols-2"
              : "grid grid-cols-1 gap-4"
          }
        >
          {showHackathons && <HackathonCard hackathons={data.hackathons} />}
          {showIdeas && <IdeasCard ideas={data.ideas} />}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PenaltyLedgerCard rows={data.ledger} />
        <ActivityFeedCard events={data.activity} />
      </div>
    </div>
  );
}
