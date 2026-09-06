import { requireWorkspacePage as requireWorkspaceSession } from "@/lib/hub/context";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { getAuditLog } from "@/lib/audit-log";
import {
  getCurrentMember,
  isCurrentMemberLeader,
  isDevViewingAsMember,
} from "@/lib/current-member";
import { getOrgSettings } from "@/lib/org-settings";
import {
  reconcileMembers,
  type MemberReconciliation,
} from "@/lib/member-reconciliation";
import { getActionQueue } from "@/lib/admin/queue";
import { buildSearchIndex } from "@/lib/admin/search";
import { getAdminStats } from "@/lib/admin/stats";
import { getAdminTableData } from "@/lib/admin/tables";
import { AdminConsole } from "@/components/admin/admin-console";
import { ToastProvider } from "@/components/ui/toast";

/**
 * The admin console — see 20-admin-dashboard.md.
 *
 * This replaced a directory page: four stat cards, each a "View all" link
 * to a separate route, so every admin action started by leaving. The
 * console finishes the work in place — drawers instead of routes, inline
 * cells instead of edit pages, a merged Action Queue instead of four
 * per-page pending sections.
 *
 * Access is enforced by app/(app)/admin/layout.tsx (a server-side redirect
 * on the Clerk org:admin role), and again by requireAdmin() inside every
 * mutation route — hiding a control is not access control.
 *
 * The old deep-link routes (/admin/members, /admin/finance,
 * /admin/penalties, /admin/projects) still exist and still work; they are
 * no longer linked from here.
 */
export default async function AdminConsolePage() {
  await requireWorkspaceSession();

  const { userId, orgId } = await auth();

  // The layout above already redirects an unauthenticated visitor, but
  // Next renders layout and page in parallel — so without this the page
  // still starts, and getCurrentMember() throws before the layout's
  // redirect lands. Checking here also avoids running every query below
  // for a request that was never going to render.
  if (!userId) {
    redirect("/sign-in");
  }

  const [
    tables,
    queue,
    auditLog,
    settings,
    currentMember,
    isLeader,
    isViewingAsMember,
  ] = await Promise.all([
    getAdminTableData(),
    getActionQueue(),
    getAuditLog(200),
    getOrgSettings(),
    getCurrentMember(),
    isCurrentMemberLeader(),
    isDevViewingAsMember(),
  ]);

  const [searchIndex, stats, reconciliationResult] = await Promise.all([
    buildSearchIndex(tables),
    // Both of these call Clerk. getAdminStats() degrades to a labelled
    // "Clerk unreachable" card rather than silently showing the unscoped
    // local count — the exact failure mode that made the member count
    // wrong in the first place.
    orgId
      ? getAdminStats(orgId)
      : Promise.resolve({
          cards: [],
          exceptions: [],
          memberCountDegraded: true,
        }),
    orgId
      ? reconcileMembers(orgId).then(
          (
            report,
          ): { report: MemberReconciliation | null; error: string | null } => ({
            report,
            error: null,
          }),
          (): {
            report: MemberReconciliation | null;
            error: string | null;
          } => ({
            report: null,
            error: "Couldn't reach Clerk to compare the roster.",
          }),
        )
      : Promise.resolve({
          report: null,
          error: "No active Clerk organization on this session.",
        }),
  ]);

  return (
    <ToastProvider>
      <AdminConsole
        stats={stats}
        queue={queue}
        tables={tables}
        auditLog={auditLog}
        searchIndex={searchIndex}
        settings={settings}
        reconciliation={reconciliationResult.report}
        reconciliationError={reconciliationResult.error}
        isLeader={isLeader}
        isViewingAsMember={isViewingAsMember}
        currentMemberId={currentMember.id}
      />
    </ToastProvider>
  );
}
