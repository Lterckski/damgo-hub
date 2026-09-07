"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Receipt } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPHP } from "@/lib/currency";
import { dueLabel, relativeDayLabel } from "@/lib/dashboard/relative-time";
import type { MyPenaltyRow } from "@/lib/dashboard/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { CardEmptyState, PanelCard } from "@/components/dashboard/panel-card";
import { useSingleFlight } from "@/hooks/use-action-guard";

/**
 * My Penalties.
 *
 * "Mark as paid" records a claim rather than settling the penalty —
 * resolving one writes a ledger entry, which is an admin action (Part 4).
 * The button says what it does: an admin confirms afterwards.
 *
 * Settled history is collapsed below rather than dropped, so someone who
 * is clear can see that they're clear instead of an empty card that could
 * equally mean "nothing loaded".
 */

interface MyPenaltiesCardProps {
  penalties: MyPenaltyRow[];
}

export function MyPenaltiesCard({ penalties }: MyPenaltiesCardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [showHistory, setShowHistory] = React.useState(false);
  const [disputing, setDisputing] = React.useState<MyPenaltyRow | null>(null);

  const open = penalties.filter((penalty) => penalty.status === "OPEN");
  const settled = penalties.filter((penalty) => penalty.status !== "OPEN");
  const owedCents = open.reduce((sum, penalty) => sum + (penalty.amountCents ?? 0), 0);

  const single = useSingleFlight();

  async function post(body: Record<string, unknown>, penaltyId: string) {
    setBusyId(penaltyId);
    const response = await fetch("/api/dashboard/penalties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);

    const payload: unknown = await response?.json().catch(() => null);
    const data = (payload ?? {}) as Record<string, unknown>;
    setBusyId(null);

    toast({
      message:
        typeof (response?.ok ? data.message : data.error) === "string"
          ? String(response?.ok ? data.message : data.error)
          : response?.ok
            ? "Done"
            : "That didn't work",
      tone: response?.ok ? "success" : "error",
    });

    if (response?.ok) router.refresh();
    return Boolean(response?.ok);
  }

  return (
    <>
      <PanelCard
        title="My Penalties"
        icon={Receipt}
        emphasis="primary"
        // The card carries urgency only when something is actually owed.
        tone={open.some((penalty) => penalty.isPastDue) ? "critical" : "neutral"}
        headerAside={
          open.length > 0 ? (
            <div>
              <p
                className={cn(
                  "text-lg font-bold tabular-nums",
                  owedCents > 0 ? "text-state-error" : "text-copy-primary",
                )}
              >
                {formatPHP(owedCents)}
              </p>
              <p className="text-[10px] text-copy-muted uppercase">owed</p>
            </div>
          ) : null
        }
        footerHref="/penalties"
      >
        {open.length === 0 ? (
          <CardEmptyState
            message={
              settled.length === 0
                ? "No penalties on record. You're clear."
                : "Nothing outstanding — you're all settled up."
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map((penalty) => (
              <li
                key={penalty.id}
                className="rounded-xl bg-base px-3 py-2.5 ring-1 ring-surface-border"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-copy-primary">{penalty.reason}</p>
                    <p className="text-xs text-copy-muted">
                      Incurred {relativeDayLabel(penalty.incurredAt)}
                      {" · "}
                      <span className={penalty.isPastDue ? "font-semibold text-state-error" : undefined}>
                        {dueLabel(penalty.dueAt)}
                        {penalty.dueAtIsInferred && " (est.)"}
                      </span>
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-sm font-semibold tabular-nums",
                      penalty.isPastDue ? "text-state-error" : "text-copy-primary",
                    )}
                  >
                    {penalty.amountCents === null ? "—" : formatPHP(penalty.amountCents)}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {penalty.disputeStatus === "OPEN" ? (
                    <Badge variant="secondary">Dispute under review</Badge>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === penalty.id}
                        onClick={single(async () => {
                          await post({ action: "claim_paid", penaltyId: penalty.id }, penalty.id);
                        }, penalty.id)}
                      >
                        Mark as paid
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === penalty.id}
                        onClick={() => setDisputing(penalty)}
                      >
                        Dispute
                      </Button>
                    </>
                  )}
                  {penalty.disputeStatus === "REJECTED" && (
                    <span className="text-xs text-copy-muted">Previous dispute rejected</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {settled.length > 0 && (
          <div className="mt-3 border-t border-surface-border-subtle pt-2">
            <button
              type="button"
              onClick={() => setShowHistory((current) => !current)}
              className="flex items-center gap-1 text-xs font-medium text-copy-muted transition-colors hover:text-brand"
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showHistory && "rotate-180")} />
              {showHistory ? "Hide" : "Show"} history ({settled.length})
            </button>

            {showHistory && (
              <ul className="mt-2 flex flex-col gap-1">
                {settled.map((penalty) => (
                  <li key={penalty.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate text-copy-secondary">{penalty.reason}</span>
                    <span className="shrink-0 text-copy-muted">
                      {penalty.status === "WAIVED" ? "Waived" : "Paid"}
                      {penalty.resolvedAt && ` · ${relativeDayLabel(penalty.resolvedAt)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </PanelCard>

      <DisputeDialog
        penalty={disputing}
        onClose={() => setDisputing(null)}
        onSubmit={single(async (reason: string) => {
          if (!disputing) return;
          const ok = await post({ action: "dispute", penaltyId: disputing.id, reason }, disputing.id);
          if (ok) setDisputing(null);
        }, disputing ? `dispute:${disputing.id}` : "dispute")}
      />
    </>
  );
}

function DisputeDialog({
  penalty,
  onClose,
  onSubmit,
}: {
  penalty: MyPenaltyRow | null;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  if (!penalty) return null;
  return <DisputeForm penalty={penalty} onClose={onClose} onSubmit={onSubmit} />;
}

/** Split out so the textarea starts empty by mounting, without a reset effect. */
function DisputeForm({
  penalty,
  onClose,
  onSubmit,
}: {
  penalty: MyPenaltyRow;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-copy-primary">Dispute this penalty</DialogTitle>
          <DialogDescription className="text-copy-secondary">
            “{penalty.reason}” — an admin reviews this. The penalty stays open and still counts toward
            what you owe until they decide.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="dispute-reason"
            className="text-xs font-bold tracking-wide text-copy-primary uppercase"
          >
            Why are you disputing it?
          </label>
          <Textarea
            id="dispute-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            className="text-copy-primary!"
            placeholder="I was marked absent but I was on the call…"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            disabled={reason.trim().length < 3 || isSubmitting}
            onClick={async () => {
              setIsSubmitting(true);
              try {
                await onSubmit(reason.trim());
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            {isSubmitting ? "Submitting…" : "Submit dispute"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
