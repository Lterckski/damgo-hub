"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

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
import type { CaptureKind } from "@/components/dashboard/my/quick-capture";

export function QuickCaptureDialog({
  kind,
  categories,
  onClose,
}: {
  kind: CaptureKind;
  categories: string[];
  onClose: () => void;
}) {
  if (kind === "task") return <NewTaskDialog onClose={onClose} />;
  if (kind === "expense") {
    return <NewExpenseDialog categories={categories} onClose={onClose} />;
  }
  return <NewDocDialog onClose={onClose} />;
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
        message:
          typeof data.error === "string" ? data.error : "Couldn't save that",
        tone: "error",
      });
      return;
    }

    toast({
      message: typeof data.message === "string" ? data.message : "Created",
    });
    router.refresh();
    onClose();
  }

  return { submit, isSaving };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-bold tracking-wide text-copy-primary uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

function NewTaskDialog({ onClose }: { onClose: () => void }) {
  const { submit, isSaving } = useCapture(onClose);
  const [title, setTitle] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const canSave = title.trim() !== "" && dueDate !== "" && !isSaving;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-copy-primary">
            New task
          </DialogTitle>
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

function NewExpenseDialog({
  categories,
  onClose,
}: {
  categories: string[];
  onClose: () => void;
}) {
  const { submit, isSaving } = useCapture(onClose);
  const [amount, setAmount] = React.useState("");
  const [category, setCategory] = React.useState(categories[0] ?? "");
  const [description, setDescription] = React.useState("");
  const canSave = Number(amount) > 0 && category !== "" && !isSaving;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-copy-primary">
            Log an expense
          </DialogTitle>
          <DialogDescription className="text-copy-secondary">
            Submitted for approval. It counts toward &ldquo;You&rsquo;re
            owed&rdquo; until an admin approves it.
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
          <DialogTitle className="text-lg font-bold text-copy-primary">
            New doc
          </DialogTitle>
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
            onClick={() =>
              submit("/api/docs", { title: title.trim(), content })
            }
          >
            {isSaving ? "Creating…" : "Create doc"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
