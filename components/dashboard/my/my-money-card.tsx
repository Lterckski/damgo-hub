"use client";

import { Plus, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPHP } from "@/lib/currency";
import type { MyMoney } from "@/lib/dashboard/types";
import { Button } from "@/components/ui/button";
import { PanelCard } from "@/components/dashboard/panel-card";
import { useDashboardCapture } from "@/components/dashboard/my/dashboard-capture";

/**
 * My Money — replaces the old Financial Snapshot, which showed the *team's*
 * balance on a personal tab. Four of five members can't act on the org
 * balance; what they can act on is what they owe and what they're owed.
 *
 * The team figures moved to Team Overview, where they belong.
 *
 * Colour rule: "You owe" is the only figure allowed to go red, and only
 * when non-zero. "You're owed" is neutral — being owed money isn't a
 * problem state, and amber there would compete with genuine urgency.
 */

export function MyMoneyCard({ money }: { money: MyMoney }) {
  const { openCapture } = useDashboardCapture();
  const { penaltiesCents, duesCents } = money.owedBreakdown;

  return (
    <PanelCard
      title="My Money"
      icon={Wallet}
      emphasis="primary"
      tone={money.owedCents > 0 ? "warning" : "neutral"}
      footerHref="/finance"
      footerLabel="View finance"
    >
      <div className="flex flex-col gap-3">
        <Figure
          label="You owe"
          value={formatPHP(money.owedCents)}
          tone={money.owedCents > 0 ? "critical" : "neutral"}
          detail={
            money.owedCents > 0
              ? [
                  penaltiesCents > 0 ? `${formatPHP(penaltiesCents)} penalties` : null,
                  duesCents > 0 ? `${formatPHP(duesCents)} dues` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Nothing outstanding"
          }
        />

        <Figure
          label="You're owed"
          value={formatPHP(money.owedToYouCents)}
          tone="neutral"
          detail={
            money.owedToYouCount > 0
              ? `${money.owedToYouCount} reimbursement${money.owedToYouCount === 1 ? "" : "s"} awaiting approval`
              : "No pending reimbursements"
          }
        />

        <Figure
          label="You've contributed"
          value={formatPHP(money.contributedCents)}
          tone="neutral"
          detail={`Approved income, ${money.monthLabel}`}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <Button size="sm" onClick={() => openCapture("expense")}>
          <Plus className="h-4 w-4" />
          Log an expense
        </Button>
        {/* Part 1: qualified numbers carry their own timestamp. */}
        <span className="text-[10px] text-copy-faint">as of {money.asOf}</span>
      </div>
    </PanelCard>
  );
}

function Figure({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "critical";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-copy-secondary">{label}</p>
        <p className="truncate text-[11px] text-copy-muted">{detail}</p>
      </div>
      <p
        className={cn(
          "shrink-0 text-xl font-bold tabular-nums",
          tone === "critical" ? "text-state-error" : "text-copy-primary",
        )}
      >
        {value}
      </p>
    </div>
  );
}
