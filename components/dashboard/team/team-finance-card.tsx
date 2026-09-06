"use client";

import { Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPHP } from "@/lib/currency";
import type { TeamFinance } from "@/lib/dashboard/team";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CardEmptyState, PanelCard } from "@/components/dashboard/panel-card";

/**
 * Team finance — the balance/income/expenses card that used to sit on My
 * Dashboard, where four of five members could do nothing with it.
 *
 * Each figure is captioned for what it actually measures. The old card ran
 * one line, "This month, approved transactions only", under all three —
 * but the balance is all-time, so that caption was wrong for a third of
 * the card.
 */
export function TeamFinanceCard({ finance }: { finance: TeamFinance }) {
  return (
    <PanelCard
      title="Finance"
      icon={Wallet}
      emphasis="hero"
      headerAside={
        finance.pendingCount > 0 ? (
          <Badge variant="secondary">{finance.pendingCount} pending</Badge>
        ) : null
      }
      footerHref="/finance"
      footerLabel="View finance"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Figure
          label="Balance"
          value={formatPHP(finance.balanceCents)}
          caption="All time, approved"
          tone={finance.balanceCents < 0 ? "critical" : "neutral"}
        />
        <Figure
          label="Income"
          value={formatPHP(finance.monthIncomeCents)}
          caption={finance.monthLabel}
          tone="neutral"
        />
        <Figure
          label="Expenses"
          value={formatPHP(finance.monthExpenseCents)}
          caption={finance.monthLabel}
          tone="neutral"
        />
      </div>

      <p className="mt-1.5 text-[10px] text-copy-faint">
        Approved transactions only · as of {finance.asOf}
      </p>

      <div className="mt-4 border-t border-surface-border-subtle pt-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h4 className="text-[10px] font-bold tracking-[0.08em] text-copy-primary uppercase">
            Dues
          </h4>
          {finance.duesPeriodLabel && (
            <span className="text-[10px] text-copy-muted">
              {finance.duesPeriodLabel}
            </span>
          )}
        </div>

        {finance.dues.length === 0 ? (
          <CardEmptyState message="No dues period is running. Once an admin opens one, everyone's paid/unpaid status shows here." />
        ) : (
          <ul className="flex flex-wrap gap-3">
            {finance.dues.map((row) => {
              const isPaid = row.status !== "UNPAID";
              return (
                <li
                  key={row.memberId}
                  className="flex flex-col items-center gap-1"
                >
                  <span className="relative">
                    <Avatar className="h-9 w-9">
                      {row.avatarUrl && (
                        <AvatarImage src={row.avatarUrl} alt="" />
                      )}
                      <AvatarFallback className="text-[10px]">
                        {row.displayName
                          .split(" ")
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((part) => part[0]?.toUpperCase())
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                    <span
                      aria-hidden
                      className={cn(
                        "absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full ring-2 ring-surface",
                        // Amber for unpaid — this is an amount owed, which
                        // is one of the two things allowed to carry colour.
                        isPaid ? "bg-state-success" : "bg-state-warning",
                      )}
                    />
                  </span>
                  <span className="max-w-16 truncate text-[10px] text-copy-secondary">
                    {row.displayName.split(" ")[0]}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] tabular-nums",
                      isPaid ? "text-copy-muted" : "text-state-warning",
                    )}
                  >
                    {row.status === "WAIVED"
                      ? "waived"
                      : isPaid
                        ? "paid"
                        : formatPHP(row.amountCents)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PanelCard>
  );
}

function Figure({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  tone: "neutral" | "critical";
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-wide text-copy-secondary uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-lg font-bold tabular-nums",
          tone === "critical" ? "text-state-error" : "text-copy-primary",
        )}
      >
        {value}
      </p>
      <p className="text-[10px] text-copy-muted">{caption}</p>
    </div>
  );
}
