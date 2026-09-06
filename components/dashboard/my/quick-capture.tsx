"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Lightbulb, ListPlus, Receipt, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

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
        <Button size="sm" variant="outline" onClick={() => onOpenKindChange("task")}>
          <ListPlus className="h-4 w-4" />
          Task
        </Button>
        <Button size="sm" variant="outline" onClick={() => onOpenKindChange("expense")}>
          <Receipt className="h-4 w-4" />
          Expense
        </Button>
        <Button size="sm" variant="outline" onClick={() => onOpenKindChange("doc")}>
          <FileText className="h-4 w-4" />
          Doc
        </Button>
        {ideasEnabled && (
          <Button size="sm" variant="outline" render={<Link href="/ideas" />}>
            <Lightbulb className="h-4 w-4" />
            Idea
          </Button>
        )}
      </div>

      {openKind === "task" && <NewTaskDialog onClose={() => onOpenKindChange(null)} />}
      {openKind === "expense" && (
        <NewExpenseDialog categories={financeCategories} onClose={() => onOpenKindChange(null)} />
      )}
      {openKind === "doc" && <NewDocDialog onClose={() => onOpenKindChange(null)} />}
    </>
  );
}

/** Shared submit plumbing: post, toast the server's message, refresh, close. */
function useCapture(onClose: () => void) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = React.useState(false);

  async function submit(url: string, body: Record<string, unknown>) {
    setIsSaving(true);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);

    const payload: unknown = await response?.json().catch(() => null);
    const data = (payload ?? {}) as Record<string, unknown>;
    setIsSaving(false);

    if (!response?.ok) {
      toast({
        message: typeof data.error === "string" ? data.error : "Couldn't save that",
        tone: "error",
      });
      return;
    }

    toast({ message: typeof data.message === "string" ? data.message : "Created" });
    router.refresh();
    onClose();
  }

  return { submit, isSaving };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-bold tracking-wide text-copy-primary uppercase">{label}</span>
      {children}
    </div>
  );
}

function NewTaskDialog({ onClose }: { onClose: () => void }) {
  const { submit, isSaving } = useCapture(onClose);
  const [title, setTitle] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");

  // Task requires type/startDate/dueDate (08-task-assignment.md). Quick
  // Capture supplies sensible defaults rather than making a one-line
  // capture fill in four fields — the full form lives on /tasks.
  const canSave = title.trim() !== "" && dueDate !== "" && !isSaving;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-copy-primary">New task</DialogTitle>
          <DialogDescription className="text-copy-secondary">
            Assigned to you, starting today. Add detail later on the task board.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label="What needs doing?">
            <Input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="text-copy-primary!"
              placeholder="Draft the pitch deck outline"
            />
          </Field>
          <Field label="Due">
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="h-9 rounded-xl border border-surface-border bg-base px-3 text-sm text-copy-primary outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            disabled={!canSave}
            onClick={() =>
              submit("/api/tasks", {
                title: title.trim(),
                type: "Documents",
                startDate: new Date().toISOString(),
                dueDate: new Date(`${dueDate}T17:00:00`).toISOString(),
              })
            }
          >
            {isSaving ? "Creating…" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewExpenseDialog({ categories, onClose }: { categories: string[]; onClose: () => void }) {
  const { submit, isSaving } = useCapture(onClose);
  const [amount, setAmount] = React.useState("");
  const [category, setCategory] = React.useState(categories[0] ?? "");
  const [description, setDescription] = React.useState("");

  const canSave = Number(amount) > 0 && category !== "" && !isSaving;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-copy-primary">Log an expense</DialogTitle>
          <DialogDescription className="text-copy-secondary">
            Submitted for approval. It counts toward &ldquo;You&rsquo;re owed&rdquo; until an admin
            approves it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label="Amount (₱)">
            <Input
              autoFocus
              value={amount}
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
              className="text-copy-primary!"
              placeholder="250.00"
            />
          </Field>
          <Field label="Category">
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-9 rounded-xl border border-surface-border bg-base px-3 text-sm text-copy-primary outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {categories.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="What was it for?">
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="text-copy-primary!"
              placeholder="Printing for the demo booth"
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            disabled={!canSave}
            onClick={() =>
              submit("/api/dashboard/expenses", {
                amountPesos: Number(amount),
                category,
                description,
              })
            }
          >
            {isSaving ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewDocDialog({ onClose }: { onClose: () => void }) {
  const { submit, isSaving } = useCapture(onClose);
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-copy-primary">New doc</DialogTitle>
          <DialogDescription className="text-copy-secondary">
            Starts a document you can keep writing in Documentation.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label="Title">
            <Input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="text-copy-primary!"
              placeholder="Sponsorship outreach notes"
            />
          </Field>
          <Field label="First lines (optional)">
            <Textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={4}
              className="text-copy-primary!"
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            disabled={title.trim() === "" || isSaving}
            onClick={() => submit("/api/docs", { title: title.trim(), content })}
          >
            {isSaving ? "Creating…" : "Create doc"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
