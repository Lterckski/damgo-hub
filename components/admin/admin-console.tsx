"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Megaphone, Plus, Search, UserPlus } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AuditLogEntry } from "@/lib/audit-log";
import type { AdminStats } from "@/lib/admin/stats";
import type { QueueAction, QueueItem } from "@/lib/admin/queue";
import type { AdminTableData } from "@/lib/admin/tables";
import type { SearchEntry } from "@/lib/admin/search";
import type { MemberReconciliation } from "@/lib/member-reconciliation";
import type { OrgSettingsValues } from "@/lib/org-settings";
import {
  ADMIN_TABS,
  ADMIN_TAB_LABEL,
  type AdminDrawerTarget,
  type AdminTab,
  type AdminTableFilterTarget,
} from "@/lib/admin/types";
import {
  runBulkAction,
  runInlineEdit,
  runQueueAction,
} from "@/lib/admin/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ActionQueue } from "@/components/admin/action-queue";
import { AuditLogFeed } from "@/components/admin/audit-log-feed";
import { BroadcastComposer } from "@/components/admin/broadcast-composer";
import { CommandPalette } from "@/components/admin/command-palette";
import { DangerZone } from "@/components/admin/danger-zone";
import { DataTable, type BulkActionDef } from "@/components/admin/data-table";
import { OrgSettingsPanel } from "@/components/admin/org-settings-panel";
import {
  RecordDrawer,
  type DrawerAction,
} from "@/components/admin/record-drawer";
import {
  ReasonDialog,
  type ReasonRequest,
} from "@/components/admin/reason-dialog";
import { StatCards } from "@/components/admin/stat-cards";
import { SyncWithClerk } from "@/components/admin/sync-with-clerk";
import { ViewAsToggle } from "@/components/admin/view-as-toggle";
import {
  activityConfig,
  financeConfig,
  membersConfig,
  penaltiesConfig,
  projectsConfig,
  type CellHandlers,
} from "@/components/admin/table-configs";

/**
 * The admin console. Five zones on one page, and nothing here navigates.
 *
 * State lives at this level on purpose: the tab, the active stat-card
 * filter, the open drawer and the in-flight row set are one coherent
 * thing. A drawer opened from the ⌘K palette has to be able to switch the
 * table's tab underneath it; a stat card has to be able to filter a table
 * it doesn't own. Splitting that across components would mean passing the
 * same state back up anyway.
 *
 * Every mutation goes through `commitEdit` / `runAction`, which share one
 * shape: mark the row pending → call the API → toast the server's own
 * message → `router.refresh()`. The refresh is what makes optimism safe —
 * the server's numbers, not the client's guess, are what ends up on screen.
 */

interface AdminConsoleProps {
  stats: AdminStats;
  queue: QueueItem[];
  tables: AdminTableData;
  auditLog: AuditLogEntry[];
  searchIndex: SearchEntry[];
  settings: OrgSettingsValues;
  reconciliation: MemberReconciliation | null;
  reconciliationError: string | null;
  isLeader: boolean;
  isViewingAsMember: boolean;
  currentMemberId: string;
}

export function AdminConsole({
  stats,
  queue,
  tables,
  auditLog,
  searchIndex,
  settings,
  reconciliation,
  reconciliationError,
  isLeader,
  isViewingAsMember,
  currentMemberId,
}: AdminConsoleProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [tab, setTab] = React.useState<AdminTab>("members");
  const [filterId, setFilterId] = React.useState<string | null>(null);
  const [drawer, setDrawer] = React.useState<AdminDrawerTarget | null>(null);
  const [drawerToken, setDrawerToken] = React.useState(0);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [broadcastOpen, setBroadcastOpen] = React.useState(false);
  const [reasonRequest, setReasonRequest] =
    React.useState<ReasonRequest | null>(null);
  const [pendingIds, setPendingIds] = React.useState<Set<string>>(new Set());

  // The global header owns ⌘K; Shift+⌘K opens console drawer search.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const activeFilter: AdminTableFilterTarget | null = filterId
    ? { tab, filterId }
    : null;

  function markPending(ids: string[], pending: boolean) {
    setPendingIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (pending) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  /** Refresh server data, and the open drawer with it. */
  function refresh() {
    router.refresh();
    setDrawerToken((token) => token + 1);
  }

  // -------------------------------------------------------------------------
  // Inline edits
  // -------------------------------------------------------------------------

  async function commitEdit(
    kind: string,
    recordId: string,
    field: string,
    value: unknown,
    label: string,
    reason?: string,
    previousValue?: unknown,
  ) {
    markPending([recordId], true);
    const result = await runInlineEdit(kind, recordId, field, value, reason);
    markPending([recordId], false);

    toast({
      message: result.ok ? `${label} — ${result.message}` : result.message,
      tone: result.ok ? "success" : "error",
      // Undo is only offered where reverting is a plain write of the old
      // value. An edit that produced a ledger adjustment is not undone by
      // writing the number back; that needs its own corrective entry, so
      // no Undo is offered and the audit log carries the trail instead.
      undo:
        result.ok && previousValue !== undefined
          ? async () => {
              const undone = await runInlineEdit(
                kind,
                recordId,
                field,
                previousValue,
                "Undo",
              );
              toast({
                message: undone.ok ? `${label} restored` : undone.message,
                tone: undone.ok ? "info" : "error",
              });
              refresh();
            }
          : undefined,
    });

    refresh();
  }

  const cellHandlers: CellHandlers = React.useMemo(
    () => ({
      isLeader,
      currentMemberId,
      edit: (kind, recordId, field, value, label) => {
        // Waiving a penalty inline still needs its justification, same as
        // from the queue — the field is the same override either way.
        if (kind === "penalties" && field === "status" && value === "WAIVED") {
          setReasonRequest({
            title: "Waive this penalty?",
            description:
              "The penalty is closed without a ledger entry. Recorded in the audit log.",
            confirmLabel: "Waive",
            destructive: true,
            onConfirm: (reason) =>
              commitEdit(kind, recordId, field, value, label, reason),
          });
          return;
        }

        if (
          (kind === "finance" && field === "amount") ||
          (kind === "penalties" && field === "amount")
        ) {
          setReasonRequest({
            title: "Change this amount?",
            description:
              kind === "finance"
                ? "A pending transaction is edited in place. A settled one is corrected with an offsetting adjustment entry — the original record is never rewritten."
                : "Only an open penalty can be re-priced.",
            confirmLabel: "Save change",
            onConfirm: (reason) =>
              commitEdit(kind, recordId, field, value, label, reason),
          });
          return;
        }

        void commitEdit(kind, recordId, field, value, label);
      },
    }),
    // commitEdit closes over stable setters and router only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isLeader, currentMemberId],
  );

  // -------------------------------------------------------------------------
  // Queue + bulk actions
  // -------------------------------------------------------------------------

  async function runQueue(
    action: QueueAction,
    entityIds: string[],
    reason?: string,
  ) {
    markPending(entityIds, true);
    const result = await runQueueAction(action.actionId, entityIds, reason);
    markPending(entityIds, false);
    toast({ message: result.message, tone: result.ok ? "success" : "error" });
    refresh();
  }

  function onQueueAction(action: QueueAction, entityIds: string[]) {
    if (action.requiresReason) {
      setReasonRequest({
        title: `${action.label}${entityIds.length > 1 ? ` ${entityIds.length} items` : ""}?`,
        description:
          "This is an override. The reason is written to the audit log against your name.",
        confirmLabel: action.label,
        destructive: action.variant === "destructive",
        onConfirm: (reason) => runQueue(action, entityIds, reason),
      });
      return;
    }
    void runQueue(action, entityIds);
  }

  async function runBulk(
    action: BulkActionDef,
    ids: string[],
    reason?: string,
  ) {
    markPending(ids, true);
    const result = await runBulkAction(action.id, ids, action.value, reason);
    markPending(ids, false);

    const failures = result.failed?.filter((failure) => failure.error) ?? [];
    toast({
      message:
        failures.length > 0
          ? `${result.message} — ${failures[0].error}${failures.length > 1 ? ` (+${failures.length - 1} more)` : ""}`
          : result.message,
      tone: failures.length > 0 ? "error" : "success",
    });
    refresh();
  }

  function onBulkAction(action: BulkActionDef, ids: string[]) {
    if (action.requiresReason) {
      setReasonRequest({
        title: `${action.label} ${ids.length} record${ids.length === 1 ? "" : "s"}?`,
        description:
          "Applied one record at a time; each gets its own audit entry.",
        confirmLabel: action.label,
        destructive: action.destructive,
        onConfirm: (reason) => runBulk(action, ids, reason),
      });
      return;
    }
    void runBulk(action, ids);
  }

  // -------------------------------------------------------------------------
  // Drawer footer actions
  // -------------------------------------------------------------------------

  function buildDrawerActions(
    detail: Parameters<typeof buildActionsImpl>[0],
  ): DrawerAction[] {
    return buildActionsImpl(detail);
  }

  function buildActionsImpl(
    detail: Parameters<
      React.ComponentProps<typeof RecordDrawer>["buildActions"]
    >[0],
  ): DrawerAction[] {
    switch (detail.kind) {
      case "finance": {
        const transaction = detail.transaction;
        if (transaction.status !== "PENDING") return [];
        return [
          {
            id: "approve",
            label: "Approve",
            onRun: () =>
              runQueue(
                {
                  actionId: "transaction.approve",
                  label: "Approve",
                  variant: "primary",
                },
                [transaction.id],
              ),
          },
          {
            id: "reject",
            label: "Reject",
            variant: "destructive",
            onRun: () =>
              runQueue(
                {
                  actionId: "transaction.reject",
                  label: "Reject",
                  variant: "destructive",
                },
                [transaction.id],
              ),
          },
        ];
      }
      case "penalties": {
        const penalty = detail.penalty;
        if (penalty.status !== "OPEN") return [];
        return [
          {
            id: "resolve",
            label: "Mark paid",
            onRun: () =>
              runQueue(
                {
                  actionId: "penalty.resolve",
                  label: "Mark paid",
                  variant: "primary",
                },
                [penalty.id],
              ),
          },
          {
            id: "waive",
            label: "Waive…",
            variant: "destructive",
            onRun: () =>
              onQueueAction(
                {
                  actionId: "penalty.waive",
                  label: "Waive",
                  variant: "destructive",
                  requiresReason: true,
                },
                [penalty.id],
              ),
          },
        ];
      }
      case "projects": {
        const project = detail.project;
        return [
          ...(project.status === "PROPOSED"
            ? [
                {
                  id: "approve",
                  label: "Approve proposal",
                  onRun: () =>
                    runQueue(
                      {
                        actionId: "project.approve",
                        label: "Approve",
                        variant: "primary",
                      },
                      [project.id],
                    ),
                },
              ]
            : []),
          ...(project.status !== "ARCHIVED"
            ? [
                {
                  id: "archive",
                  label: "Archive",
                  variant: "destructive" as const,
                  onRun: () =>
                    runQueue(
                      {
                        actionId: "project.archive",
                        label: "Archive",
                        variant: "destructive",
                      },
                      [project.id],
                    ),
                },
              ]
            : []),
        ];
      }
      case "activity": {
        const task = detail.task;
        if (task.status === "DONE") return [];
        return [
          {
            id: "complete",
            label: "Mark done",
            onRun: () =>
              runQueue(
                {
                  actionId: "task.complete",
                  label: "Mark done",
                  variant: "primary",
                },
                [task.id],
              ),
          },
          {
            id: "extend",
            label: "Extend 7 days…",
            variant: "outline",
            onRun: () =>
              onQueueAction(
                {
                  actionId: "task.extend",
                  label: "Extend",
                  variant: "secondary",
                  requiresReason: true,
                },
                [task.id],
              ),
          },
        ];
      }
      case "members": {
        const member = detail.member;
        return [
          {
            id: "broadcast",
            label: "Message",
            variant: "outline",
            onRun: () => {
              setDrawer(null);
              setBroadcastOpen(true);
            },
          },
          ...(member.status === "ACTIVE"
            ? [
                {
                  id: "deactivate",
                  label: "Set inactive",
                  variant: "outline" as const,
                  onRun: () =>
                    commitEdit(
                      "members",
                      member.id,
                      "status",
                      "INACTIVE",
                      `${member.displayName}'s status`,
                      undefined,
                      "ACTIVE",
                    ),
                },
              ]
            : []),
        ];
      }
      default:
        return [];
    }
  }

  // -------------------------------------------------------------------------
  // Zone 4 config for the active tab
  // -------------------------------------------------------------------------

  function openDrawer(target: AdminDrawerTarget) {
    // Keep the table in step with what's being read, so closing the drawer
    // leaves you where the record actually lives.
    if (
      target.kind !== "docs" &&
      ADMIN_TABS.includes(target.kind as AdminTab)
    ) {
      setTab(target.kind as AdminTab);
    }
    setDrawer(target);
  }

  const memberOptions = tables.members.map((member) => ({
    id: member.id,
    displayName: member.displayName,
    isLeader: member.isLeader,
  }));
  const projectOptions = tables.projects.map((project) => ({
    id: project.id,
    name: project.name,
    status: project.status,
  }));

  return (
    <div className="flex flex-col gap-8 p-6 pb-24">
      {/* ---------------------------------------------------------------
          Zone 1 — command bar
      --------------------------------------------------------------- */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl text-copy-primary">Admin</h1>
            <p className="mt-1 text-sm text-copy-secondary">
              Everything awaiting a decision, and everything you need to make it
              — in one place.
            </p>
          </div>
          <ViewAsToggle isViewingAsMember={isViewingAsMember} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-10 min-w-64 flex-1 items-center gap-2 rounded-xl bg-surface px-3 text-left text-sm text-copy-faint ring-1 ring-surface-border transition-colors hover:ring-brand/40"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1">
              Search members, transactions, penalties, projects, docs…
            </span>
            <kbd className="rounded border border-surface-border px-1.5 py-0.5 text-[10px] text-copy-muted">
              ⇧⌘K
            </kbd>
          </button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPaletteOpen(true)}
          >
            <UserPlus className="h-4 w-4" />
            Member
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTab("penalties");
              setFilterId("open");
            }}
          >
            <Plus className="h-4 w-4" />
            Penalty
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTab("finance");
              setFilterId("pending");
            }}
          >
            <Plus className="h-4 w-4" />
            Transaction
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setBroadcastOpen(true)}
          >
            <Megaphone className="h-4 w-4" />
            Broadcast
          </Button>
        </div>
      </header>

      {/* ---------------------------------------------------------------
          Zone 2 — action queue
      --------------------------------------------------------------- */}
      <section>
        <SectionHeading
          title="Action queue"
          hint={
            queue.length > 0
              ? `${queue.length} awaiting a decision`
              : "Nothing waiting on you"
          }
        />
        <ActionQueue
          items={queue}
          onAction={onQueueAction}
          onOpenDrawer={openDrawer}
          pendingIds={
            new Set(
              queue
                .filter((item) => pendingIds.has(item.entityId))
                .map((item) => item.id),
            )
          }
        />
      </section>

      {/* ---------------------------------------------------------------
          Zone 3 — stat cards as filters
      --------------------------------------------------------------- */}
      <section>
        <SectionHeading
          title="Overview"
          hint="Click a card to filter the table below"
        />
        <StatCards
          cards={stats.cards}
          activeFilter={activeFilter}
          onSelect={(target) => {
            if (!target) {
              setFilterId(null);
              return;
            }
            setTab(target.tab);
            setFilterId(target.filterId);
          }}
        />

        <div className="mt-4">
          <SectionHeading
            title="Exceptions"
            hint="What needs attention, not what exists"
            small
          />
          <StatCards
            cards={stats.exceptions}
            activeFilter={activeFilter}
            variant="exception"
            onSelect={(target) => {
              if (!target) {
                setFilterId(null);
                return;
              }
              setTab(target.tab);
              setFilterId(target.filterId);
            }}
          />
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Zone 4 — segmented data table
      --------------------------------------------------------------- */}
      <section>
        <SectionHeading
          title="Records"
          hint="Row click opens the detail drawer"
        />

        <div className="mb-3 flex flex-wrap gap-1.5">
          {ADMIN_TABS.map((candidate) => (
            <Button
              key={candidate}
              size="sm"
              variant={tab === candidate ? "default" : "outline"}
              onClick={() => {
                setTab(candidate);
                setFilterId(null);
              }}
            >
              {ADMIN_TAB_LABEL[candidate]}
              <span
                className={cn(
                  "ml-1.5 text-xs tabular-nums",
                  tab === candidate ? "opacity-80" : "text-copy-muted",
                )}
              >
                {tables[candidate].length}
              </span>
            </Button>
          ))}
        </div>

        {tab === "members" && (
          <DataTable
            key="members"
            rows={tables.members}
            config={membersConfig(cellHandlers)}
            activeFilterId={filterId}
            onFilterChange={setFilterId}
            onRowClick={(row) =>
              openDrawer({ kind: "members", recordId: row.id })
            }
            onBulkAction={onBulkAction}
            pendingIds={pendingIds}
          />
        )}
        {tab === "finance" && (
          <DataTable
            key="finance"
            rows={tables.finance}
            config={financeConfig(cellHandlers, settings.financeCategories)}
            activeFilterId={filterId}
            onFilterChange={setFilterId}
            onRowClick={(row) =>
              openDrawer({ kind: "finance", recordId: row.id })
            }
            onBulkAction={onBulkAction}
            pendingIds={pendingIds}
          />
        )}
        {tab === "penalties" && (
          <DataTable
            key="penalties"
            rows={tables.penalties}
            config={penaltiesConfig(cellHandlers)}
            activeFilterId={filterId}
            onFilterChange={setFilterId}
            onRowClick={(row) =>
              openDrawer({ kind: "penalties", recordId: row.id })
            }
            onBulkAction={onBulkAction}
            pendingIds={pendingIds}
          />
        )}
        {tab === "projects" && (
          <DataTable
            key="projects"
            rows={tables.projects}
            config={projectsConfig(cellHandlers)}
            activeFilterId={filterId}
            onFilterChange={setFilterId}
            onRowClick={(row) =>
              openDrawer({ kind: "projects", recordId: row.id })
            }
            onBulkAction={onBulkAction}
            pendingIds={pendingIds}
          />
        )}
        {tab === "activity" && (
          <DataTable
            key="activity"
            rows={tables.activity}
            config={activityConfig(cellHandlers)}
            activeFilterId={filterId}
            onFilterChange={setFilterId}
            onRowClick={(row) =>
              row.kind === "task"
                ? openDrawer({ kind: "activity", recordId: row.id })
                : undefined
            }
            onBulkAction={onBulkAction}
            pendingIds={pendingIds}
          />
        )}
      </section>

      {/* ---------------------------------------------------------------
          Admin tools
      --------------------------------------------------------------- */}
      <section className="flex flex-col gap-4">
        <SectionHeading
          title="Organization"
          hint="Reconciliation, settings, and irreversible actions"
        />
        <SyncWithClerk
          report={reconciliation}
          error={reconciliationError}
          members={memberOptions}
          onSynced={refresh}
        />
        <OrgSettingsPanel settings={settings} />
        <DangerZone
          members={memberOptions}
          projects={projectOptions}
          currentMemberId={currentMemberId}
          onDone={refresh}
        />
      </section>

      {/* ---------------------------------------------------------------
          Zone 5 — audit log
      --------------------------------------------------------------- */}
      <section>
        <SectionHeading
          title="Audit log"
          hint="Append-only. Every admin action, actor, before → after, and reason."
        />
        <AuditLogFeed entries={auditLog} />
      </section>

      {/* Overlays ---------------------------------------------------- */}
      <RecordDrawer
        target={drawer}
        onClose={() => setDrawer(null)}
        buildActions={buildDrawerActions}
        refreshToken={drawerToken}
      />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        entries={searchIndex}
        onSelect={openDrawer}
        quickActions={[
          {
            id: "broadcast",
            label: "Compose a broadcast",
            run: () => setBroadcastOpen(true),
          },
          {
            id: "queue",
            label: "Jump to the action queue",
            run: () =>
              document
                .querySelector("h2")
                ?.scrollIntoView({ behavior: "smooth" }),
          },
          {
            id: "pending-finance",
            label: "Show pending transactions",
            run: () => {
              setTab("finance");
              setFilterId("pending");
            },
          },
          {
            id: "past-due",
            label: "Show past-due penalties",
            run: () => {
              setTab("penalties");
              setFilterId("past_due");
            },
          },
          {
            id: "not-in-clerk",
            label: "Show members not in the Clerk org",
            run: () => {
              setTab("members");
              setFilterId("not_in_clerk");
            },
          },
        ]}
      />

      <BroadcastComposer
        open={broadcastOpen}
        onOpenChange={setBroadcastOpen}
        members={memberOptions}
        projects={projectOptions}
      />

      <ReasonDialog
        request={reasonRequest}
        onClose={() => setReasonRequest(null)}
      />
    </div>
  );
}

function SectionHeading({
  title,
  hint,
  small,
}: {
  title: string;
  hint: string;
  small?: boolean;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2
        className={cn(
          "font-bold tracking-[0.08em] text-copy-primary uppercase",
          small ? "text-[10px]" : "text-xs",
        )}
      >
        {title}
      </h2>
      <p className="text-xs text-copy-muted">{hint}</p>
    </div>
  );
}
