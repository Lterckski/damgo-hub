import { Scale } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPHP } from "@/lib/currency";
import { dueLabel } from "@/lib/dashboard/relative-time";
import type { LedgerRow } from "@/lib/dashboard/team";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CardEmptyState, PanelCard } from "@/components/dashboard/panel-card";

/**
 * Row 7 — the team-wide penalty ledger, OPEN only, visible to everyone.
 *
 * Read-only here by design (Part 4): resolving or waiving writes a ledger
 * entry, which stays in /admin. This card's job is transparency, not
 * enforcement.
 */
export function PenaltyLedgerCard({ rows }: { rows: LedgerRow[] }) {
  const total = rows.reduce((sum, row) => sum + (row.amountCents ?? 0), 0);

  return (
    <PanelCard
      title="Penalty Ledger"
      icon={Scale}
      emphasis="secondary"
      headerAside={
        rows.length > 0 ? (
          <span className="text-sm font-semibold text-copy-primary tabular-nums">
            {formatPHP(total)}
          </span>
        ) : null
      }
      footerHref="/penalties"
    >
      {rows.length === 0 ? (
        <CardEmptyState message="No open penalties across the team — everyone is settled up." />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-2.5">
              <Avatar className="h-6 w-6 shrink-0">
                {row.memberAvatarUrl && <AvatarImage src={row.memberAvatarUrl} alt="" />}
                <AvatarFallback className="text-[10px]">
                  {row.memberName
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase())
                    .join("")}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-copy-primary">{row.reason}</p>
                <p className="truncate text-xs text-copy-muted">
                  {row.memberName} ·{" "}
                  <span className={row.isPastDue ? "text-state-error" : undefined}>
                    {dueLabel(row.dueAt)}
                  </span>
                </p>
              </div>

              {row.isDisputed && (
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  Disputed
                </Badge>
              )}

              <span
                className={cn(
                  "shrink-0 text-sm font-semibold tabular-nums",
                  row.isPastDue ? "text-state-error" : "text-copy-primary",
                )}
              >
                {row.amountCents === null ? "—" : formatPHP(row.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}
