"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { BoardAutosaveStatus } from "@/hooks/use-board-autosave";

// "loading" (fetching a saved snapshot on mount) and "idle" (nothing to
// report — no unsaved changes yet, or the room already had content so no
// load ever happened) both render nothing; 15-board-autosave.md only asks
// for a saving/saved/error indicator, and there's nothing useful to tell
// the member in either of those two other states.
const STATUS_CONFIG: Partial<
  Record<BoardAutosaveStatus, { label: string; icon: typeof Check; spin?: boolean; className: string }>
> = {
  saving: { label: "Saving…", icon: Loader2, spin: true, className: "text-copy-secondary" },
  saved: { label: "Saved", icon: Check, className: "text-success" },
  error: { label: "Couldn't save", icon: AlertCircle, className: "text-error" },
};

/**
 * Small save-status readout for a collaborative board's control bar — see
 * 15-board-autosave.md step 5. Generic (just reads `BoardAutosaveStatus`),
 * so it's ready for `19-ideas-board.md` to drop in next to its own control
 * bar the same way `13-roadmap-board.md`'s does.
 */
export function BoardSaveStatus({ status }: { status: BoardAutosaveStatus }) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;

  const Icon = config.icon;
  return (
    <div className={cn("flex items-center gap-1.5 px-1.5 text-xs font-medium", config.className)}>
      <Icon className={cn("h-3.5 w-3.5", config.spin && "animate-spin")} />
      {config.label}
    </div>
  );
}
