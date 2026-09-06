/**
 * Shared vocabulary for the admin console. Kept in one module because the
 * server queries, the client table, the drawers, and the command palette
 * all have to agree on what a "tab" and a "record" are — the console's
 * whole premise is that every one of those opens in place rather than
 * navigating, so they can't each invent their own ids.
 */

export const ADMIN_TABS = ["members", "finance", "penalties", "projects", "activity"] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

export const ADMIN_TAB_LABEL: Record<AdminTab, string> = {
  members: "Members",
  finance: "Finance",
  penalties: "Penalties",
  projects: "Projects",
  activity: "Activity",
};

export function isAdminTab(value: unknown): value is AdminTab {
  return typeof value === "string" && (ADMIN_TABS as readonly string[]).includes(value);
}

/**
 * A saved filter a stat card applies to the table below it. Stat cards are
 * filters, not links — clicking one narrows Zone 4 in place, so each card
 * names a tab and one of that tab's filter ids.
 */
export interface AdminTableFilterTarget {
  tab: AdminTab;
  filterId: string;
}

/**
 * What a drawer can show. A superset of the tabs: docs are searchable from
 * the command palette and open a drawer like anything else, but they don't
 * warrant a segment of their own in Zone 4.
 */
export const ADMIN_RECORD_KINDS = [...ADMIN_TABS, "docs"] as const;
export type AdminRecordKind = (typeof ADMIN_RECORD_KINDS)[number];

/** Which drawer to open, and for which record. Never a route. */
export interface AdminDrawerTarget {
  kind: AdminRecordKind;
  recordId: string;
}
