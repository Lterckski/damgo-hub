"use client";

import {
  AlertTriangle,
  CircleAlert,
  FolderKanban,
  Receipt,
  ReceiptText,
  ScanLine,
  Timer,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { AdminStatCard } from "@/lib/admin/stats";
import type { AdminTableFilterTarget } from "@/lib/admin/types";

/**
 * Zone 3 — the stat cards, as filters.
 *
 * The "View all" links are gone: a card no longer sends you to another
 * page, it narrows the table below it in place. The active card stays lit
 * so the table's current scope is always attributable to something on
 * screen.
 *
 * Every card carries a breakdown line under its number. That's the fix for
 * the member count bug in interface form — a bare "6" could be wrong
 * silently, "5 active · 1 pending · 1 not in Clerk" cannot.
 */

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  members: Users,
  penalties: AlertTriangle,
  transactions: ReceiptText,
  projects: FolderKanban,
  balance: Wallet,
  overdue: Timer,
  "members-owing": CircleAlert,
  "missing-receipts": Receipt,
  "stale-projects": ScanLine,
};

const TONE_RING: Record<AdminStatCard["tone"], string> = {
  neutral: "ring-surface-border",
  positive: "ring-surface-border",
  warning: "ring-state-warning/40",
  critical: "ring-state-error/40",
};

const TONE_VALUE: Record<AdminStatCard["tone"], string> = {
  neutral: "text-copy-primary",
  positive: "text-copy-primary",
  warning: "text-state-warning",
  critical: "text-state-error",
};

interface StatCardsProps {
  cards: AdminStatCard[];
  activeFilter: AdminTableFilterTarget | null;
  onSelect: (filter: AdminTableFilterTarget | null) => void;
  /** Exception cards get a tighter, secondary treatment. */
  variant?: "primary" | "exception";
}

function isSameFilter(a: AdminTableFilterTarget | null, b: AdminTableFilterTarget | null): boolean {
  if (!a || !b) return false;
  return a.tab === b.tab && a.filterId === b.filterId;
}

export function StatCards({ cards, activeFilter, onSelect, variant = "primary" }: StatCardsProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2",
        variant === "primary" ? "lg:grid-cols-3 xl:grid-cols-6" : "lg:grid-cols-3",
      )}
    >
      {cards.map((card) => {
        const Icon = ICONS[card.key] ?? TrendingUp;
        const isActive = isSameFilter(card.filter, activeFilter);
        const isEmpty = card.value === "0";

        return (
          <button
            key={card.key}
            type="button"
            aria-pressed={isActive}
            disabled={!card.filter}
            onClick={() => onSelect(isActive ? null : card.filter)}
            className={cn(
              "group/stat relative flex h-full flex-col overflow-hidden rounded-2xl bg-surface text-left shadow-sm ring-1 transition-all",
              TONE_RING[card.tone],
              card.filter && "hover:shadow-md hover:ring-brand/40",
              isActive && "ring-2 ring-brand shadow-md",
              !card.filter && "cursor-default",
            )}
          >
            <div
              className={cn(
                "h-1 shrink-0 bg-gradient-to-r transition-opacity",
                isActive ? "from-brand to-collab opacity-100" : "from-brand to-collab opacity-60",
              )}
            />
            <div className="flex flex-1 flex-col gap-2 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-dim text-brand">
                  <Icon className="h-4 w-4" />
                </span>
                <h3 className="text-xs font-bold tracking-[0.08em] text-copy-primary uppercase">
                  {card.label}
                </h3>
              </div>

              {isEmpty && card.emptyHint ? (
                <>
                  <p className={cn("text-3xl font-bold", TONE_VALUE[card.tone])}>{card.value}</p>
                  {/* Part 3: a card reading "0" with nothing else tells an
                      admin nothing. Say what would be here instead. */}
                  <p className="text-xs leading-relaxed text-copy-secondary">{card.emptyHint}</p>
                </>
              ) : (
                <>
                  <p className={cn("text-3xl font-bold", TONE_VALUE[card.tone])}>{card.value}</p>
                  {card.breakdown && (
                    <p className="text-xs text-copy-secondary">{card.breakdown}</p>
                  )}
                </>
              )}

              {card.delta && <p className="mt-auto pt-1 text-xs text-copy-muted">{card.delta}</p>}
            </div>

            {card.filter && (
              <span className="pointer-events-none absolute right-4 bottom-3 text-[10px] font-semibold tracking-wide text-brand uppercase opacity-0 transition-opacity group-hover/stat:opacity-100">
                {isActive ? "Clear filter" : "Filter table"}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
