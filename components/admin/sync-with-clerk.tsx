"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, GitMerge, RefreshCw } from "lucide-react";

import type { LocalOnlyRow, MemberReconciliation } from "@/lib/member-reconciliation";
import { mergeMemberRequest, syncWithClerk } from "@/lib/admin/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ReasonDialog, type ReasonRequest } from "@/components/admin/reason-dialog";
import { useSingleFlight } from "@/hooks/use-action-guard";

/**
 * The reconciliation utility Part 0 called for.
 *
 * Shows the diff first and repairs only on an explicit click, because the
 * bug this exists for was a number that was wrong with nothing on screen
 * to say so — replacing it with a repair that runs invisibly would repeat
 * the mistake in the other direction.
 *
 * Repair is deliberately partial: it creates missing local rows and marks
 * orphans REMOVED, but never hard-deletes. Deleting a Member row means
 * deciding what happens to their tasks, docs, transactions and penalties,
 * which is the Danger Zone's job, not a sync button's.
 */

interface SyncWithClerkProps {
  report: MemberReconciliation | null;
  /** Why the report is missing, when Clerk couldn't be reached. */
  error: string | null;
  /** Everyone the console knows about, as merge targets. */
  members: { id: string; displayName: string }[];
  onSynced: () => void;
}

export function SyncWithClerk({ report, error, members, onSynced }: SyncWithClerkProps) {
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [mergeRequest, setMergeRequest] = React.useState<ReasonRequest | null>(null);

  const single = useSingleFlight();

  async function sync() {
    setIsSyncing(true);
    try {
      const result = await syncWithClerk();
      toast({ message: result.message, tone: result.ok ? "success" : "error" });
      if (result.ok) onSynced();
    } finally {
      setIsSyncing(false);
    }
  }

  if (error || !report) {
    return (
      <div className="rounded-2xl bg-surface p-5 ring-1 ring-surface-border">
        <Header />
        <p className="mt-3 text-sm text-state-error">
          {error ?? "Couldn't reach Clerk to build the comparison."}
        </p>
      </div>
    );
  }

  // A row already marked REMOVED is a handled orphan, not outstanding
  // drift — counting it would leave this panel permanently unhappy about
  // something that's been dealt with.
  const unhandledOrphans = report.inLocalNotClerk.filter((row) => row.status !== "REMOVED");
  const drift =
    report.inClerkNotLocal.length +
    unhandledOrphans.length +
    report.roleDrift.length +
    report.duplicateEmails.length;

  return (
    <div className="rounded-2xl bg-surface p-5 ring-1 ring-surface-border">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Header />
        <Button size="sm" variant="outline" onClick={single(sync)} disabled={isSyncing}>
          <RefreshCw className={isSyncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {isSyncing ? "Syncing…" : "Sync with Clerk"}
        </Button>
      </div>

      <p className="mt-3 text-sm text-copy-secondary">
        <span className="font-semibold text-copy-primary">{report.counts.active} active</span>
        {report.counts.inactive > 0 && ` · ${report.counts.inactive} inactive`}
        {` · ${report.counts.pending} pending invite${report.counts.pending === 1 ? "" : "s"}`}
        {` · ${report.counts.clerkTotal} in Clerk`}
        {` · ${report.counts.localTotal} local row${report.counts.localTotal === 1 ? "" : "s"}`}
      </p>

      {drift === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-state-success">
          <CheckCircle2 className="h-4 w-4" />
          Clerk and the local table agree.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <DriftGroup
            title="In Clerk, no local row"
            hint="Created automatically on their next visit — syncing just does it now."
            items={report.inClerkNotLocal.map((row) => `${row.displayName} · ${row.email}`)}
          />
          <OrphanGroup
            orphans={unhandledOrphans}
            members={members}
            onMerge={(source, targetId) =>
              setMergeRequest({
                title: `Merge ${source.displayName} into another member?`,
                description:
                  `Everything this record owns moves to the member you picked, and this row is marked ` +
                  `Removed. Use this when the two rows are the same person; use the Danger Zone's ` +
                  `Remove instead when they genuinely left.`,
                confirmLabel: "Merge records",
                destructive: true,
                confirmationPhrase: source.displayName,
                onConfirm: async (reason) => {
                  const result = await mergeMemberRequest({
                    sourceId: source.id,
                    targetId,
                    confirmation: source.displayName,
                    reason,
                  });
                  toast({ message: result.message, tone: result.ok ? "success" : "error" });
                  if (result.ok) onSynced();
                },
              })
            }
          />
          <DriftGroup
            title="Role drift"
            hint="Marked as Leader locally, but not org:admin in Clerk."
            items={report.roleDrift.map((row) => `${row.displayName} · Clerk says ${row.clerkRole}`)}
            severe
          />
          <DriftGroup
            title="Duplicate emails"
            hint="Member.email has no unique constraint — one person with two Clerk accounts lands here."
            items={report.duplicateEmails.map((group) => `${group.email} · ${group.memberIds.length} rows`)}
            severe
          />
        </div>
      )}

      <ReasonDialog request={mergeRequest} onClose={() => setMergeRequest(null)} />
    </div>
  );
}

/**
 * Orphans get their own group rather than a one-line summary, because the
 * decision they need isn't "acknowledge" — it's merge (same person, two
 * accounts) versus remove (they actually left). The content counts are
 * what tells those two apart, so they're on screen next to the choice.
 */
function OrphanGroup({
  orphans,
  members,
  onMerge,
}: {
  orphans: LocalOnlyRow[];
  members: { id: string; displayName: string }[];
  onMerge: (source: LocalOnlyRow, targetId: string) => void;
}) {
  const [targets, setTargets] = React.useState<Record<string, string>>({});

  if (orphans.length === 0) return null;

  return (
    <div className="rounded-xl bg-base p-3 ring-1 ring-surface-border">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-state-warning" />
        <p className="text-xs font-bold tracking-wide text-copy-primary uppercase">
          In the local table, not in the Clerk org
        </p>
        <Badge variant="destructive">{orphans.length}</Badge>
      </div>
      <p className="mt-1 text-xs text-copy-muted">
        These are what inflate a naive member count. Syncing marks them Removed; merging re-points
        their work to the right person first.
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {orphans.map((orphan) => {
          const candidates = members.filter((member) => member.id !== orphan.id);
          const selected = targets[orphan.id] ?? candidates[0]?.id ?? "";
          const content = orphan.content;

          return (
            <li key={orphan.id} className="rounded-xl bg-surface p-3 ring-1 ring-surface-border">
              <p className="text-sm font-semibold text-copy-primary">{orphan.displayName}</p>
              <p className="text-xs text-copy-secondary">
                {orphan.email} · {orphan.status} · added{" "}
                {new Date(orphan.createdAt).toLocaleDateString()}
              </p>

              {content && (
                <p className="mt-1.5 text-xs text-copy-muted">
                  {content.total === 0
                    ? "Owns nothing — safe to remove outright."
                    : `Owns ${content.total} record${content.total === 1 ? "" : "s"}: ` +
                      Object.entries(content)
                        .filter(([key, value]) => key !== "total" && typeof value === "number" && value > 0)
                        .map(([key, value]) => `${value} ${key.replace(/([A-Z])/g, " $1").toLowerCase()}`)
                        .join(", ")}
                </p>
              )}

              {candidates.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="text-xs text-copy-secondary" htmlFor={`merge-${orphan.id}`}>
                    Merge into
                  </label>
                  <select
                    id={`merge-${orphan.id}`}
                    value={selected}
                    onChange={(event) =>
                      setTargets((current) => ({ ...current, [orphan.id]: event.target.value }))
                    }
                    className="h-8 rounded-lg border border-surface-border bg-base px-2 text-xs text-copy-primary outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {candidates.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!selected}
                    onClick={() => onMerge(orphan, selected)}
                  >
                    <GitMerge className="h-3.5 w-3.5" />
                    Merge…
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h3 className="text-xs font-bold tracking-[0.08em] text-copy-primary uppercase">
        Clerk reconciliation
      </h3>
      <p className="mt-0.5 text-xs text-copy-muted">
        Clerk organization membership vs. the local Member table.
      </p>
    </div>
  );
}

function DriftGroup({
  title,
  hint,
  items,
  severe,
}: {
  title: string;
  hint: string;
  items: string[];
  severe?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-xl bg-base p-3 ring-1 ring-surface-border">
      <div className="flex items-center gap-2">
        {severe && <AlertTriangle className="h-3.5 w-3.5 text-state-warning" />}
        <p className="text-xs font-bold tracking-wide text-copy-primary uppercase">{title}</p>
        <Badge variant={severe ? "destructive" : "secondary"}>{items.length}</Badge>
      </div>
      <p className="mt-1 text-xs text-copy-muted">{hint}</p>
      <ul className="mt-2 flex flex-col gap-1">
        {items.map((item) => (
          <li key={item} className="text-xs text-copy-secondary">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
