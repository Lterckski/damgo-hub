import Link from "next/link";

import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface DashboardWidgetProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  viewAllHref?: string;
  viewAllLabel?: string;
  children: React.ReactNode;
}

/**
 * Shared Card shell for every dashboard widget — see 06-dashboard-home.md
 * and ui-context.md's "Widget header" pattern. Headers are a deliberately
 * high-contrast, uppercase "eyebrow" style (icon + tracked-out label in
 * `--text-primary`) rather than shadcn's default muted CardTitle, and the
 * card gets a brand-colored top accent bar plus a hover lift — the point is
 * that every widget reads as a distinct, alive surface, not a flat gray box.
 */
export function DashboardWidget({
  title,
  icon: Icon,
  viewAllHref,
  viewAllLabel = "View all",
  children,
}: DashboardWidgetProps) {
  return (
    <Card className="group/widget relative flex h-full flex-col overflow-hidden border-none py-0 shadow-sm ring-1 ring-surface-border transition-all hover:shadow-md hover:ring-brand/40">
      <div className="h-1 shrink-0 bg-gradient-to-r from-brand to-collab" />
      <CardHeader className="flex-row shrink-0 items-center justify-between gap-2 px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-dim text-brand">
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="text-xs font-bold tracking-[0.08em] text-copy-primary uppercase">
            {title}
          </h3>
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="text-xs font-semibold text-brand transition-colors hover:text-copy-primary hover:underline"
          >
            {viewAllLabel}
          </Link>
        )}
      </CardHeader>
      {/* flex-1 — when a taller sibling stretches this card's grid row (a
          widget with a long list vs. this one's empty state), the content
          area needs to actually fill that extra height, or WidgetEmptyState
          below can only center within its own small natural size and ends
          up sitting near the top with dead space underneath. */}
      <CardContent className="flex-1 px-5 pb-5">{children}</CardContent>
    </Card>
  );
}

interface WidgetEmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  message: string;
}

/**
 * Icon + short message for a widget with no data — see
 * 06-dashboard-home.md. h-full + centering so it fills whatever height
 * DashboardWidget's now-flexed CardContent actually has (a lone empty
 * widget still just sizes to its own content; a stretched one truly
 * centers in the extra space instead of hugging the top with a gap
 * below).
 */
export function WidgetEmptyState({ icon: Icon, message }: WidgetEmptyStateProps) {
  return (
    <div className="flex h-full min-h-[7rem] flex-col items-center justify-center gap-2 py-6 text-center">
      <Icon className="h-8 w-8 text-copy-faint" />
      <p className="text-sm text-copy-secondary">{message}</p>
    </div>
  );
}
