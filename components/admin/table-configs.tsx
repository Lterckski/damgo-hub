"use client";

import { formatPHP } from "@/lib/currency";
import { MEMBER_STATUS_LABEL } from "@/lib/member-status";
import type {
  ActivityTableRow,
  FinanceTableRow,
  MemberTableRow,
  PenaltyTableRow,
  ProjectTableRow,
} from "@/lib/admin/tables";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { TableConfig } from "@/components/admin/data-table";
import { InlineAmount, InlineDate, InlineSelect } from "@/components/admin/inline-cells";

/**
 * Per-tab column, filter and bulk-action definitions for Zone 4's shared
 * table.
 *
 * Filter ids here are the same strings `lib/admin/stats.ts` names in each
 * stat card's `filter.filterId` — that's the contract that lets a card
 * narrow the table in place instead of linking somewhere.
 */

export interface CellHandlers {
  edit: (kind: string, recordId: string, field: string, value: unknown, label: string) => void;
  /** Only the Leader may change org roles — mirrors the server-side check. */
  isLeader: boolean;
  currentMemberId: string;
}

function Person({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-6 w-6">
        {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
        <AvatarFallback className="text-[10px]">
          {name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}
        </AvatarFallback>
      </Avatar>
      <span className="truncate text-copy-primary">{name}</span>
    </div>
  );
}

function readable(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------

export function membersConfig(handlers: CellHandlers): TableConfig<MemberTableRow> {
  return {
    rowId: (row) => row.id,
    exportName: "members",
    searchText: (row) => `${row.displayName} ${row.email} ${row.functionalRoles.join(" ")}`,
    emptyState: {
      title: "No members yet",
      description: "Invite your team from Clerk, then run Sync with Clerk to pull them in.",
    },
    filters: [
      { id: "all", label: "All", predicate: () => true },
      { id: "admins", label: "Admins", predicate: (row) => row.orgRole === "org:admin" },
      { id: "inactive", label: "Inactive", predicate: (row) => row.status !== "ACTIVE" },
      { id: "not_in_clerk", label: "Not in Clerk", predicate: (row) => !row.inClerkOrg },
      { id: "owing", label: "Owing", predicate: (row) => row.openPenaltyCount > 0 },
    ],
    bulkActions: [
      { id: "members.set_status", label: "Set inactive", value: "INACTIVE" },
      ...(handlers.isLeader
        ? [{ id: "members.set_role", label: "Make member", value: "org:member" as const }]
        : []),
    ],
    columns: [
      {
        id: "name",
        header: "Member",
        sortValue: (row) => row.displayName,
        csvValue: (row) => row.displayName,
        cell: (row) => (
          <div className="flex items-center gap-2">
            <Person name={row.displayName} avatarUrl={row.avatarUrl} />
            {row.isLeader && <Badge className="text-[10px]">Leader</Badge>}
            {!row.inClerkOrg && (
              <Badge variant="destructive" className="text-[10px]">
                Not in Clerk
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: "email",
        header: "Email",
        sortValue: (row) => row.email,
        cell: (row) => <span className="text-copy-secondary">{row.email}</span>,
      },
      {
        id: "role",
        header: "Role",
        sortValue: (row) => row.orgRole,
        csvValue: (row) => row.orgRole,
        cell: (row) => (
          <InlineSelect
            value={row.orgRole === "org:admin" ? "org:admin" : "org:member"}
            options={[
              { value: "org:member", label: "Member" },
              { value: "org:admin", label: "Admin" },
            ]}
            // The Leader's seat isn't reassignable, and only the Leader
            // hands out org:admin — the same two rules the route enforces.
            disabled={row.isLeader || !handlers.isLeader}
            disabledReason={
              row.isLeader ? "The Leader's seat is fixed" : "Only the Leader can change roles"
            }
            onCommit={(next) =>
              handlers.edit("members", row.id, "orgRole", next, `${row.displayName}'s role`)
            }
          />
        ),
      },
      {
        id: "status",
        header: "Status",
        sortValue: (row) => row.status,
        csvValue: (row) => row.status,
        cell: (row) =>
          row.status === "REMOVED" ? (
            <Badge variant="destructive">{MEMBER_STATUS_LABEL.REMOVED}</Badge>
          ) : (
            <InlineSelect
              value={row.status === "ACTIVE" ? "ACTIVE" : "INACTIVE"}
              options={[
                { value: "ACTIVE", label: "Active" },
                { value: "INACTIVE", label: "Inactive" },
              ]}
              onCommit={(next) =>
                handlers.edit("members", row.id, "status", next, `${row.displayName}'s status`)
              }
            />
          ),
      },
      {
        id: "penalties",
        header: "Open penalties",
        sortValue: (row) => row.openPenaltyCount,
        cell: (row) =>
          row.openPenaltyCount === 0 ? (
            <span className="text-copy-muted">—</span>
          ) : (
            <Badge variant="destructive">{row.openPenaltyCount}</Badge>
          ),
      },
      {
        id: "tasks",
        header: "Open tasks",
        sortValue: (row) => row.openTaskCount,
        cell: (row) => <span className="tabular-nums text-copy-primary">{row.openTaskCount}</span>,
      },
      {
        id: "tags",
        header: "Role tags",
        defaultVisible: false,
        csvValue: (row) => row.functionalRoles.join("; "),
        cell: (row) => (
          <span className="text-xs text-copy-secondary">
            {row.functionalRoles.map(readable).join(", ") || "—"}
          </span>
        ),
      },
      {
        id: "joined",
        header: "Joined",
        defaultVisible: false,
        sortValue: (row) => row.createdAt,
        cell: (row) => (
          <span className="text-xs text-copy-muted">
            {new Date(row.createdAt).toLocaleDateString()}
          </span>
        ),
      },
    ],
  };
}

// ---------------------------------------------------------------------------

export function financeConfig(
  handlers: CellHandlers,
  categories: string[],
): TableConfig<FinanceTableRow> {
  return {
    rowId: (row) => row.id,
    exportName: "transactions",
    searchText: (row) => `${row.memberName} ${row.category} ${row.description ?? ""} ${row.status}`,
    emptyState: {
      title: "No transactions yet",
      description: "Income and expenses submitted by the team appear here for approval.",
    },
    filters: [
      { id: "pending", label: "Pending", predicate: (row) => row.status === "PENDING" },
      { id: "approved", label: "Approved", predicate: (row) => row.status === "APPROVED" },
      {
        id: "missing_receipt",
        label: "Missing receipt",
        predicate: (row) => row.type === "EXPENSE" && !row.hasReceipt && row.status !== "REJECTED",
      },
    ],
    bulkActions: [
      { id: "finance.approve", label: "Approve" },
      { id: "finance.reject", label: "Reject", destructive: true },
    ],
    columns: [
      {
        id: "member",
        header: "Member",
        sortValue: (row) => row.memberName,
        csvValue: (row) => row.memberName,
        cell: (row) => <Person name={row.memberName} avatarUrl={row.memberAvatarUrl} />,
      },
      {
        id: "type",
        header: "Type",
        sortValue: (row) => row.type,
        cell: (row) => (
          <Badge variant={row.type === "INCOME" ? "default" : "secondary"}>
            {row.type === "INCOME" ? "In" : "Out"}
          </Badge>
        ),
      },
      {
        id: "category",
        header: "Category",
        sortValue: (row) => row.category,
        csvValue: (row) => row.category,
        cell: (row) => (
          <InlineSelect
            value={row.category}
            options={[...new Set([row.category, ...categories])].map((category) => ({
              value: category,
              label: category,
            }))}
            onCommit={(next) => handlers.edit("finance", row.id, "category", next, "Category")}
          />
        ),
      },
      {
        id: "amount",
        header: "Amount",
        sortValue: (row) => row.amountCents,
        csvValue: (row) => row.amountCents / 100,
        headerClassName: "text-right",
        cellClassName: "group text-right",
        cell: (row) => (
          <InlineAmount
            valueCents={row.amountCents}
            onCommit={(next) =>
              handlers.edit("finance", row.id, "amount", next, `${row.category} amount`)
            }
          />
        ),
      },
      {
        id: "status",
        header: "Status",
        sortValue: (row) => row.status,
        csvValue: (row) => row.status,
        cell: (row) => (
          <Badge
            variant={
              row.status === "APPROVED"
                ? "default"
                : row.status === "REJECTED"
                  ? "destructive"
                  : "secondary"
            }
          >
            {readable(row.status)}
          </Badge>
        ),
      },
      {
        id: "receipt",
        header: "Receipt",
        sortValue: (row) => (row.hasReceipt ? 1 : 0),
        cell: (row) =>
          row.hasReceipt ? (
            <span className="text-xs text-state-success">Attached</span>
          ) : (
            <span className="text-xs text-state-warning">Missing</span>
          ),
      },
      {
        id: "date",
        header: "Submitted",
        sortValue: (row) => row.createdAt,
        cell: (row) => (
          <span className="text-xs text-copy-muted">
            {new Date(row.createdAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "description",
        header: "Description",
        defaultVisible: false,
        csvValue: (row) => row.description,
        cell: (row) => (
          <span className="text-xs text-copy-secondary">{row.description ?? "—"}</span>
        ),
      },
    ],
  };
}

// ---------------------------------------------------------------------------

export function penaltiesConfig(handlers: CellHandlers): TableConfig<PenaltyTableRow> {
  return {
    rowId: (row) => row.id,
    exportName: "penalties",
    searchText: (row) => `${row.memberName} ${row.reason} ${row.status}`,
    emptyState: {
      title: "No penalties issued",
      description: "Issued penalties, their amounts and whether they've been settled show here.",
    },
    filters: [
      { id: "open", label: "Open", predicate: (row) => row.status === "OPEN" },
      { id: "past_due", label: "Past due", predicate: (row) => row.isPastDue },
      { id: "settled", label: "Settled", predicate: (row) => row.status !== "OPEN" },
    ],
    bulkActions: [
      { id: "penalties.resolve", label: "Mark paid" },
      { id: "penalties.waive", label: "Waive", destructive: true, requiresReason: true },
    ],
    columns: [
      {
        id: "member",
        header: "Member",
        sortValue: (row) => row.memberName,
        csvValue: (row) => row.memberName,
        cell: (row) => <Person name={row.memberName} avatarUrl={row.memberAvatarUrl} />,
      },
      {
        id: "reason",
        header: "Reason",
        sortValue: (row) => row.reason,
        csvValue: (row) => row.reason,
        cell: (row) => <span className="text-copy-primary">{row.reason}</span>,
      },
      {
        id: "amount",
        header: "Amount",
        sortValue: (row) => row.amountCents ?? -1,
        csvValue: (row) => (row.amountCents === null ? null : row.amountCents / 100),
        headerClassName: "text-right",
        cellClassName: "group text-right",
        cell: (row) => (
          <InlineAmount
            valueCents={row.amountCents}
            allowEmpty
            // A settled penalty's issued terms are never rewritten — the
            // same invariant the API enforces, surfaced as a disabled cell
            // rather than a rejected request.
            disabled={row.status !== "OPEN"}
            disabledReason="A settled penalty can't be re-priced"
            onCommit={(next) => handlers.edit("penalties", row.id, "amount", next, "Penalty amount")}
          />
        ),
      },
      {
        id: "due",
        header: "Due",
        sortValue: (row) => row.dueAt,
        csvValue: (row) => new Date(row.dueAt).toISOString().slice(0, 10),
        cellClassName: "group",
        cell: (row) => (
          <InlineDate
            value={row.dueAt}
            isInferred={row.dueAtIsInferred}
            isOverdue={row.isPastDue}
            disabled={row.status !== "OPEN"}
            onCommit={(next) => handlers.edit("penalties", row.id, "dueAt", next, "Due date")}
          />
        ),
      },
      {
        id: "status",
        header: "Status",
        sortValue: (row) => row.status,
        csvValue: (row) => row.status,
        cell: (row) =>
          row.status === "OPEN" ? (
            <Badge variant={row.isPastDue ? "destructive" : "secondary"}>
              {row.isPastDue ? "Past due" : "Open"}
            </Badge>
          ) : (
            <Badge>{readable(row.status)}</Badge>
          ),
      },
      {
        id: "issuedBy",
        header: "Issued by",
        defaultVisible: false,
        sortValue: (row) => row.issuedByName,
        cell: (row) => <span className="text-xs text-copy-secondary">{row.issuedByName}</span>,
      },
    ],
  };
}

// ---------------------------------------------------------------------------

export function projectsConfig(handlers: CellHandlers): TableConfig<ProjectTableRow> {
  return {
    rowId: (row) => row.id,
    exportName: "projects",
    searchText: (row) => `${row.name} ${row.ownerName} ${row.status} ${row.category ?? ""}`,
    emptyState: {
      title: "No projects yet",
      description: "Proposals awaiting approval show in the queue above; approved ones land here.",
    },
    filters: [
      { id: "active", label: "Active", predicate: (row) => row.status === "ACTIVE" },
      { id: "proposed", label: "Proposed", predicate: (row) => row.status === "PROPOSED" },
      { id: "stale", label: "Idle", predicate: (row) => row.isStale },
    ],
    bulkActions: [{ id: "projects.archive", label: "Archive", destructive: true }],
    columns: [
      {
        id: "name",
        header: "Project",
        sortValue: (row) => row.name,
        csvValue: (row) => row.name,
        cell: (row) => (
          <div className="flex items-center gap-2">
            <span className="font-medium text-copy-primary">{row.name}</span>
            {row.isStale && (
              <Badge variant="secondary" className="text-[10px]">
                Idle
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: "owner",
        header: "Owner",
        sortValue: (row) => row.ownerName,
        csvValue: (row) => row.ownerName,
        cell: (row) => <Person name={row.ownerName} avatarUrl={row.ownerAvatarUrl} />,
      },
      {
        id: "status",
        header: "Status",
        sortValue: (row) => row.status,
        csvValue: (row) => row.status,
        cell: (row) => (
          <InlineSelect
            value={row.status}
            options={[
              { value: "PROPOSED", label: "Proposed" },
              { value: "ACTIVE", label: "Active" },
              { value: "COMPLETED", label: "Completed" },
              { value: "ARCHIVED", label: "Archived" },
            ]}
            onCommit={(next) => handlers.edit("projects", row.id, "status", next, `${row.name} status`)}
          />
        ),
      },
      {
        id: "priority",
        header: "Priority",
        sortValue: (row) => row.priority,
        csvValue: (row) => row.priority,
        cell: (row) => (
          <InlineSelect
            value={row.priority}
            options={[
              { value: "LOW", label: "Low" },
              { value: "MEDIUM", label: "Medium" },
              { value: "HIGH", label: "High" },
            ]}
            onCommit={(next) =>
              handlers.edit("projects", row.id, "priority", next, `${row.name} priority`)
            }
          />
        ),
      },
      {
        id: "tasks",
        header: "Tasks",
        sortValue: (row) => row.openTaskCount,
        cell: (row) => (
          <span className="text-xs text-copy-secondary tabular-nums">
            {row.openTaskCount} open / {row.taskCount}
          </span>
        ),
      },
      {
        id: "budget",
        header: "Budget",
        defaultVisible: false,
        sortValue: (row) => row.estimatedBudgetCents ?? -1,
        csvValue: (row) => (row.estimatedBudgetCents === null ? null : row.estimatedBudgetCents / 100),
        cell: (row) => (
          <span className="tabular-nums text-copy-primary">
            {row.estimatedBudgetCents === null ? "—" : formatPHP(row.estimatedBudgetCents)}
          </span>
        ),
      },
      {
        id: "updated",
        header: "Last activity",
        sortValue: (row) => row.updatedAt,
        cell: (row) => (
          <span className="text-xs text-copy-muted">
            {new Date(row.updatedAt).toLocaleDateString()}
          </span>
        ),
      },
    ],
  };
}

// ---------------------------------------------------------------------------

export function activityConfig(handlers: CellHandlers): TableConfig<ActivityTableRow> {
  return {
    rowId: (row) => row.id,
    exportName: "activity",
    searchText: (row) => `${row.title} ${row.subjectName} ${row.projectName ?? ""} ${row.status}`,
    emptyState: {
      title: "No recent activity",
      description: "Tasks and meetings across the team appear here, newest first.",
    },
    filters: [
      { id: "overdue", label: "Overdue", predicate: (row) => row.isOverdue },
      { id: "tasks", label: "Tasks", predicate: (row) => row.kind === "task" },
      { id: "meetings", label: "Meetings", predicate: (row) => row.kind === "meeting" },
    ],
    bulkActions: [],
    columns: [
      {
        id: "title",
        header: "Item",
        sortValue: (row) => row.title,
        csvValue: (row) => row.title,
        cell: (row) => (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {row.kind === "task" ? "Task" : "Meeting"}
            </Badge>
            <span className="truncate text-copy-primary">{row.title}</span>
          </div>
        ),
      },
      {
        id: "subject",
        header: "Assignee",
        sortValue: (row) => row.subjectName,
        csvValue: (row) => row.subjectName,
        cell: (row) => <Person name={row.subjectName} avatarUrl={row.subjectAvatarUrl} />,
      },
      {
        id: "status",
        header: "Status",
        sortValue: (row) => row.status,
        csvValue: (row) => row.status,
        cell: (row) =>
          row.kind === "task" ? (
            <InlineSelect
              value={row.status}
              options={[
                { value: "TODO", label: "To do" },
                { value: "IN_PROGRESS", label: "In progress" },
                { value: "DONE", label: "Done" },
              ]}
              onCommit={(next) => handlers.edit("activity", row.id, "status", next, row.title)}
            />
          ) : (
            <Badge variant="secondary">{readable(row.status)}</Badge>
          ),
      },
      {
        id: "due",
        header: "Due",
        sortValue: (row) => row.dueAt ?? "",
        csvValue: (row) => (row.dueAt ? new Date(row.dueAt).toISOString().slice(0, 10) : null),
        cellClassName: "group",
        cell: (row) =>
          row.kind === "task" ? (
            <InlineDate
              value={row.dueAt}
              isOverdue={row.isOverdue}
              onCommit={(next) => handlers.edit("activity", row.id, "dueAt", next, `${row.title} due date`)}
            />
          ) : (
            <span className="text-xs text-copy-muted">
              {row.dueAt ? new Date(row.dueAt).toLocaleDateString() : "—"}
            </span>
          ),
      },
      {
        id: "project",
        header: "Project",
        defaultVisible: false,
        csvValue: (row) => row.projectName,
        cell: (row) => (
          <span className="text-xs text-copy-secondary">{row.projectName ?? "—"}</span>
        ),
      },
    ],
  };
}
