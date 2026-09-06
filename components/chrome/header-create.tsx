"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  NewTaskDialog,
  type NewTaskDialogProps,
} from "@/components/tasks/new-task-dialog";
import { MeetingFormDialog } from "@/components/meetings/meeting-form-dialog";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { hubGet, hubPost } from "./hub-client";
import { createLabels, type CreateKind } from "./header-create-types";
export function HeaderCreate({
  kind,
  onClose,
}: {
  kind: CreateKind;
  onClose: () => void;
}) {
  const router = useRouter();
  const [options, setOptions] = useState<
    (NewTaskDialogProps & { financeCategories: string[] }) | null
  >(null);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const locked = useRef(false);
  const ideaId = useRef<string>("");
  useEffect(() => {
    const controller = new AbortController();
    hubGet<NonNullable<typeof options>>("mode=options", controller.signal)
      .then(setOptions)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  async function submit() {
    if (locked.current) return;
    locked.current = true;
    setSaving(true);
    setError("");
    try {
      if (kind === "idea") {
        ideaId.current ||= crypto.randomUUID();
        await hubPost({ action: "idea", id: ideaId.current, text });
      } else if (kind === "announcement")
        await hubPost({ action: "announcement", title, text });
      else {
        const response = await fetch(
          kind === "expense" ? "/api/dashboard/expenses" : "/api/docs",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              kind === "expense"
                ? {
                    amountPesos: Number(amount),
                    category: category || options?.financeCategories[0],
                    description: text,
                  }
                : { title, content: text },
            ),
          },
        );
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Unable to save");
      }
      router.refresh();
      window.dispatchEvent(new Event("hub:refresh"));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }
  if (options && kind === "task")
    return (
      <NewTaskDialog {...options} open onOpenChange={(v) => !v && onClose()} />
    );
  if (options && kind === "meeting")
    return (
      <MeetingFormDialog
        members={options.members}
        currentMemberId={options.currentMemberId}
        isAdmin={options.isAdmin}
        open
        onOpenChange={(v) => !v && onClose()}
      />
    );
  return (
    <Dialog open onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogTitle className="text-lg font-bold text-copy-primary">
          {createLabels[kind]}
        </DialogTitle>
        <DialogDescription>
          Create it here and keep your place.
        </DialogDescription>
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        {!options ? (
          <p className="text-copy-secondary">Loading workspace options…</p>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {(kind === "doc" || kind === "announcement") && (
              <label className="grid gap-2 text-sm font-medium text-copy-primary">
                Title
                <Input
                  autoFocus
                  required
                  maxLength={160}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-copy-primary!"
                />
              </label>
            )}
            {kind === "expense" && (
              <>
                <label className="grid gap-2 text-sm font-medium text-copy-primary">
                  Amount (₱)
                  <Input
                    autoFocus
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="text-copy-primary!"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-copy-primary">
                  Category
                  <select
                    className="rounded-xl border border-surface-border bg-surface p-2"
                    value={category || options.financeCategories[0]}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {options.financeCategories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label className="grid gap-2 text-sm font-medium text-copy-primary">
              {kind === "idea" ? "Your idea" : "Details"}
              <Textarea
                autoFocus={kind === "idea"}
                required={kind === "idea"}
                maxLength={5000}
                rows={5}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="text-copy-primary!"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button disabled={saving}>
                {saving
                  ? "Saving…"
                  : kind === "expense"
                    ? "Submit for approval"
                    : "Create"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
