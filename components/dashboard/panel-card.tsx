import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * The dashboard's card shell.
 *
 * Replaces `DashboardWidget` on /dashboard specifically. That component
 * renders every card at identical weight, which is what made the old
 * dashboard a flat 2×2 grid where nothing looked more important than
 * anything else. This one takes an explicit `emphasis`, and the panels
 * choose it per card so size and weight carry meaning.
 *
 * Two other rules from the rebuild live here rather than in each card:
 *
 *  - **"View all" is a footer link, never the first thing under the
 *    title.** It's rendered at the bottom, in tertiary weight, after the
 *    content. A card's job is to show rows, not to advertise a page that
 *    shows rows.
 *  - **Color is reserved.** The accent bar is neutral by default. Only a
 *    card that can legitimately carry urgency passes `tone`, and only the
 *    Needs You Today strip passes "critical".
 */

export type CardEmphasis = "hero" | "primary" | "secondary";
export type CardTone = "neutral" | "warning" | "critical";

interface PanelCardProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  emphasis?: CardEmphasis;
  tone?: CardTone;
  /** Right-aligned in the header — a total, a count, a timestamp. */
  headerAside?: React.ReactNode;
  /** Small tertiary link at the card's bottom. */
  footerHref?: string;
  footerLabel?: string;
  className?: string;
  children: React.ReactNode;
}

const TONE_ACCENT: Record<CardTone, string> = {
  // Neutral is the default and the overwhelming majority: a gradient that
  // reads as brand identity, not as a signal.
  neutral: "bg-gradient-to-r from-brand/60 to-collab/60",
  warning: "bg-state-warning",
  critical: "bg-state-error",
};

const TONE_RING: Record<CardTone, string> = {
  neutral: "ring-surface-border",
  warning: "ring-state-warning/40",
  critical: "ring-state-error/40",
};

const EMPHASIS_PADDING: Record<CardEmphasis, string> = {
  hero: "px-5 py-4",
  primary: "px-5 py-4",
  secondary: "px-4 py-3.5",
};

export function PanelCard({
  title,
  icon: Icon,
  emphasis = "primary",
  tone = "neutral",
  headerAside,
  footerHref,
  footerLabel = "View all",
  className,
  children,
}: PanelCardProps) {
  return (
    <section
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 transition-shadow hover:shadow-md",
        TONE_RING[tone],
        className,
      )}
    >
      <div className={cn("h-1 shrink-0", TONE_ACCENT[tone])} />

      <header
        className={cn(
          "flex shrink-0 items-center justify-between gap-3",
          EMPHASIS_PADDING[emphasis],
          "pb-2",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-dim text-brand">
            <Icon className="h-4 w-4" />
          </span>
          <h3
            className={cn(
              "truncate font-bold tracking-[0.08em] text-copy-primary uppercase",
              emphasis === "hero" ? "text-sm" : "text-xs",
            )}
          >
            {title}
          </h3>
        </div>
        {headerAside && <div className="shrink-0 text-right">{headerAside}</div>}
      </header>

      <div className={cn("min-h-0 flex-1", EMPHASIS_PADDING[emphasis], "pt-0 pb-3")}>{children}</div>

      {footerHref && (
        <footer className="shrink-0 border-t border-surface-border-subtle px-5 py-2">
          <Link
            href={footerHref}
            className="text-xs font-medium text-copy-muted transition-colors hover:text-brand"
          >
            {footerLabel} →
          </Link>
        </footer>
      )}
    </section>
  );
}

interface CardEmptyStateProps {
  message: string;
  /** Every empty state gets an action — the rule for this rebuild. */
  action?: React.ReactNode;
}

/**
 * "No tasks assigned to you yet" with a way to fix it. An empty state
 * without an action just tells someone they have nothing and leaves them
 * on a dead end.
 */
export function CardEmptyState({ message, action }: CardEmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-2.5 py-3">
      <p className="text-sm text-copy-secondary">{message}</p>
      {action}
    </div>
  );
}
