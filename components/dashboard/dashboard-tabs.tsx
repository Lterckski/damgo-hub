"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DashboardTabsProps {
  /** Rendered inline with the tab strip — the greeting shares this row. */
  greeting: React.ReactNode;
  /** Right-hand side of the header row: Quick Capture. */
  headerAction: React.ReactNode;
  myDashboard: React.ReactNode;
  teamOverview: React.ReactNode;
}

/**
 * Switches `/dashboard` between panels — and now owns the header row too.
 *
 * The greeting, the tab strip and Quick Capture sit on ONE line. Before
 * this they were stacked: an h1, a subtitle, then the tabs, then content,
 * which spent roughly a third of the fold before showing anything. The tab
 * strip has to be inside `<Tabs>` to work, so the greeting is passed in
 * and composed here rather than the page rendering it above.
 */
export function DashboardTabs({
  greeting,
  headerAction,
  myDashboard,
  teamOverview,
}: DashboardTabsProps) {
  return (
    <Tabs defaultValue="mine">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {greeting}

        <TabsList className="h-9 gap-1 rounded-xl bg-subtle p-1">
          <TabsTrigger
            value="mine"
            className="rounded-lg px-3 text-sm font-semibold text-copy-secondary data-active:bg-elevated data-active:text-brand"
          >
            My Dashboard
          </TabsTrigger>
          <TabsTrigger
            value="team"
            className="rounded-lg px-3 text-sm font-semibold text-copy-secondary data-active:bg-elevated data-active:text-brand"
          >
            Team Overview
          </TabsTrigger>
        </TabsList>

        <div className="ml-auto">{headerAction}</div>
      </div>

      <TabsContent value="mine" className="mt-5">
        {myDashboard}
      </TabsContent>
      <TabsContent value="team" className="mt-5">
        {teamOverview}
      </TabsContent>
    </Tabs>
  );
}
