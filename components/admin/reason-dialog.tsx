"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useSingleFlight } from "@/hooks/use-action-guard";

/**
 * The reason prompt every override action goes through.
 *
 * The server rejects a missing reason on its own (lib/audit-log.ts's
 * `requireReason`), so this dialog is the humane half of that rule rather
 * than the enforcing half — it collects the justification before the
 * request rather than after a 400.
 */

export interface ReasonRequest {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  /** Extra confirmation: the caller must type this string exactly. */
  confirmationPhrase?: string;
  onConfirm: (reason: string) => Promise<void> | void;
}

/**
 * The form's state starts empty for each request by mounting fresh — the
 * inner component is only rendered while a request exists. That's why
 * there's no effect resetting the fields when `request` changes.
 */
export function ReasonDialog({
  request,
  onClose,
}: {
  request: ReasonRequest | null;
  onClose: () => void;
}) {
  if (!request) return null;
  return <ReasonForm request={request} onClose={onClose} />;
}

function ReasonForm({ request, onClose }: { request: ReasonRequest; onClose: () => void }) {
  const [reason, setReason] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const phrase = request.confirmationPhrase;
  const phraseMatches =
    !phrase || confirmation.trim().toLowerCase() === phrase.trim().toLowerCase();
  const canSubmit = reason.trim().length >= 3 && phraseMatches && !isSubmitting;

  const single = useSingleFlight();

  async function submit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await request.onConfirm(reason.trim());
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-copy-primary">{request.title}</DialogTitle>
          <DialogDescription className="text-copy-secondary">{request.description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="override-reason"
              className="text-xs font-bold tracking-wide text-copy-primary uppercase"
            >
              Reason <span className="text-state-error">*</span>
            </label>
            <Textarea
              id="override-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why is this override necessary?"
              rows={3}
              className="text-copy-primary!"
            />
            <p className="text-xs text-copy-muted">
              Recorded in the audit log against your name. At least 3 characters.
            </p>
          </div>

          {phrase && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="override-confirmation"
                className="text-xs font-bold tracking-wide text-copy-primary uppercase"
              >
                Type “{phrase}” to confirm
              </label>
              <input
                id="override-confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="h-9 rounded-xl border border-surface-border bg-base px-3 text-sm text-copy-primary outline-none focus-visible:ring-2 focus-visible:ring-brand"
                autoComplete="off"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant={request.destructive ? "destructive" : "default"}
            onClick={single(submit)}
            disabled={!canSubmit}
          >
            {isSubmitting ? "Working…" : request.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
