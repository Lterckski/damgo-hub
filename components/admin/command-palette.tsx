"use client";

import * as React from "react";
import { CornerDownLeft, Search } from "lucide-react";

import { findPaletteResults } from "@/lib/admin/palette-results";
import { cn } from "@/lib/utils";
import type { SearchEntry } from "@/lib/admin/search";
import type { AdminDrawerTarget } from "@/lib/admin/types";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * Zone 1's ⌘K palette — members, transactions, penalties, projects and
 * docs in one index.
 *
 * Results are actionable, not navigational: Enter opens that record's
 * drawer over whatever you were already doing. Nothing here produces a
 * link, which is the point — the old /admin was a page of links, and this
 * console is the place the work finishes.
 */

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: SearchEntry[];
  onSelect: (target: AdminDrawerTarget) => void;
  /** Quick actions listed when the query is empty. */
  quickActions: { id: string; label: string; run: () => void }[];
}

const MAX_RESULTS = 24;

export function CommandPalette({
  open,
  onOpenChange,
  entries,
  onSelect,
  quickActions,
}: CommandPaletteProps) {
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  /** Clears on close rather than on open, so no effect has to watch `open`. */
  function handleOpenChange(next: boolean) {
    if (!next) {
      setQuery("");
      setActiveIndex(0);
    }
    onOpenChange(next);
  }

  /** Highlight always returns to the first result when the query changes. */
  function handleQueryChange(next: string) {
    setQuery(next);
    setActiveIndex(0);
  }

  const results = React.useMemo(
    () => open ? findPaletteResults(entries, query, MAX_RESULTS) : [],
    [entries, query, open],
  );

  const showQuickActions = query.trim() === "";
  const itemCount = showQuickActions ? quickActions.length : results.length;

  // Keep the highlighted row in view when arrowing past the fold.
  React.useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function commit(index: number) {
    if (showQuickActions) {
      quickActions[index]?.run();
      handleOpenChange(false);
      return;
    }
    const entry = results[index];
    if (!entry) return;
    onSelect(entry.drawer);
    handleOpenChange(false);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (itemCount === 0 ? 0 : (current + 1) % itemCount));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (itemCount === 0 ? 0 : (current - 1 + itemCount) % itemCount));
    } else if (event.key === "Enter") {
      event.preventDefault();
      commit(activeIndex);
    }
  }

  let lastGroup: string | null = null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-24 max-w-xl translate-y-0 gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Search Damgo Hub</DialogTitle>

        <div className="flex items-center gap-3 border-b border-surface-border px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-copy-faint" />
          <input
            autoFocus
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search members, transactions, penalties, projects, docs…"
            className="w-full bg-transparent text-sm text-copy-primary outline-none placeholder:text-copy-faint"
          />
          <kbd className="rounded border border-surface-border px-1.5 py-0.5 text-[10px] text-copy-muted">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {showQuickActions ? (
            <>
              <p className="px-4 py-1.5 text-[10px] font-bold tracking-[0.08em] text-copy-secondary uppercase">
                Quick actions
              </p>
              {quickActions.map((action, index) => (
                <Row
                  key={action.id}
                  index={index}
                  isActive={index === activeIndex}
                  onHover={setActiveIndex}
                  onClick={() => commit(index)}
                  title={action.label}
                  subtitle={null}
                />
              ))}
            </>
          ) : results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-copy-secondary">
              Nothing matches “{query.trim()}”.
            </p>
          ) : (
            results.map((entry, index) => {
              const showHeading = entry.group !== lastGroup;
              lastGroup = entry.group;
              return (
                <React.Fragment key={entry.id}>
                  {showHeading && (
                    <p className="px-4 pt-2 pb-1.5 text-[10px] font-bold tracking-[0.08em] text-copy-secondary uppercase">
                      {entry.group}
                    </p>
                  )}
                  <Row
                    index={index}
                    isActive={index === activeIndex}
                    onHover={setActiveIndex}
                    onClick={() => commit(index)}
                    title={entry.title}
                    subtitle={entry.subtitle}
                  />
                </React.Fragment>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-surface-border bg-elevated px-4 py-2 text-[10px] text-copy-muted">
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft className="h-3 w-3" /> opens the record here
          </span>
          <span className="ml-auto">↑↓ to navigate</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  index,
  isActive,
  onHover,
  onClick,
  title,
  subtitle,
}: {
  index: number;
  isActive: boolean;
  onHover: (index: number) => void;
  onClick: () => void;
  title: string;
  subtitle: string | null;
}) {
  return (
    <button
      type="button"
      data-index={index}
      onMouseEnter={() => onHover(index)}
      onClick={onClick}
      className={cn(
        "flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left transition-colors",
        isActive ? "bg-accent-dim" : "hover:bg-subtle",
      )}
    >
      <span className="text-sm font-medium text-copy-primary">{title}</span>
      {subtitle && <span className="text-xs text-copy-secondary">{subtitle}</span>}
    </button>
  );
}
