"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { FileText, Lightbulb, ListPlus, Receipt, Zap } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const QuickCaptureDialog = dynamic(
  () =>
    import("@/components/dashboard/my/quick-capture-dialog").then(
      (module) => module.QuickCaptureDialog,
    ),
  {
    loading: () => (
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-0 z-50 flex items-center justify-center bg-base/80 p-4"
      >
        <div className="rounded-2xl border border-surface-border bg-elevated px-5 py-4 text-sm font-medium text-copy-secondary shadow-xl">
          Loading quick capture…
        </div>
      </div>
    ),
  },
);

/**
 * Quick Capture — create without leaving the dashboard.
 *
 * Three of the four create inline against existing routes. "New idea" is
 * the exception and links out on purpose: idea notes are React Flow nodes
 * positioned on a shared Liveblocks canvas (19-ideas-board.md), so there is
 * no server-side way to create one — a note needs a position on the board
 * and a live room to place it in. Pretending otherwise would mean a button
 * that silently does nothing.
 */

export type CaptureKind = "task" | "expense" | "doc";

interface QuickCaptureProps {
  /** Finance categories from OrgSettings — never a hardcoded list. */
  financeCategories: string[];
  ideasEnabled: boolean;
  /** Lets sibling cards ("Create task", "Log an expense") open this. */
  openKind: CaptureKind | null;
  onOpenKindChange: (kind: CaptureKind | null) => void;
}

export function QuickCapture({
  financeCategories,
  ideasEnabled,
  openKind,
  onOpenKindChange,
}: QuickCaptureProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="hidden items-center gap-1.5 pr-1 text-xs font-semibold text-copy-muted sm:flex">
          <Zap className="h-3.5 w-3.5 text-brand" />
          Quick add
        </span>
        <Button
          size="sm"
          variant="outline"
          className="min-h-11 sm:min-h-7"
          onClick={() => onOpenKindChange("task")}
        >
          <ListPlus className="h-4 w-4" />
          Task
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="min-h-11 sm:min-h-7"
          onClick={() => onOpenKindChange("expense")}
        >
          <Receipt className="h-4 w-4" />
          Expense
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="min-h-11 sm:min-h-7"
          onClick={() => onOpenKindChange("doc")}
        >
          <FileText className="h-4 w-4" />
          Doc
        </Button>
        {ideasEnabled && (
          <Link
            href="/ideas"
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "min-h-11 sm:min-h-7",
            )}
          >
            <Lightbulb className="h-4 w-4" />
            Idea
          </Link>
        )}
      </div>

      {openKind && (
        <QuickCaptureDialog
          kind={openKind}
          categories={financeCategories}
          onClose={() => onOpenKindChange(null)}
        />
      )}
    </>
  );
}
