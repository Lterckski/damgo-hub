"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, X } from "lucide-react";

import { ActionButton } from "@/components/shared/action-button";
import { useSingleFlight } from "@/hooks/use-action-guard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface ProjectDecisionActionsProps {
  projectId: string;
  projectName: string;
}

/**
 * Approve / Reject for a PROPOSED project.
 *
 * Rendered only for admins, but that is presentation: the route re-derives
 * the Clerk role per request and refuses a member regardless of what the
 * browser sends. Rejecting collects a reason because the server requires
 * one (`requireReason`), not merely because the dialog asks.
 */
export function ProjectDecisionActions({
  projectId,
  projectName,
}: ProjectDecisionActionsProps) {
  const router = useRouter();
  // One slot for both decisions: approving and rejecting the same proposal
  // are mutually exclusive, and letting both start means the loser's 409
  // can land after the winner's refresh and show a stale error.
  const single = useSingleFlight();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  async function decide(decision: "APPROVE" | "REJECT") {
    setError("");
    const response = await fetch(`/api/projects/${projectId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        ...(decision === "REJECT" ? { reason } : {}),
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      // A 409 here is the expected answer to a second decision — someone
      // else got there first, or a click landed twice. Say so plainly
      // instead of pretending it worked.
      setError(body?.error ?? "Could not record the decision");
      return;
    }
    setRejecting(false);
    setReason("");
    router.refresh();
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      // These controls sit inside the card's Link. stopPropagation alone
      // does not stop the anchor's default navigation, which would push to
      // the project page and unmount the reject dialog before a reason
      // could be typed — so cancel the default too.
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <ActionButton
        size="sm"
        variant="default"
        pendingLabel="Approving…"
        onAction={single(() => decide("APPROVE"))}
      >
        <Check className="h-3.5 w-3.5" /> Approve
      </ActionButton>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        onClick={() => setRejecting(true)}
      >
        <X className="h-3.5 w-3.5" /> Reject
      </Button>
      {error && <span className="text-xs text-error">{error}</span>}

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-copy-primary">
              Reject {projectName}?
            </DialogTitle>
          </DialogHeader>
          <label className="text-xs font-bold uppercase tracking-wide text-copy-primary">
            Reason
          </label>
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this proposal being rejected?"
            className="text-copy-primary!"
          />
          <p className="text-xs text-copy-secondary">
            The reason is recorded in the audit log and cannot be edited later.
          </p>
          {error && <p className="text-xs text-error">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRejecting(false)}
            >
              Cancel
            </Button>
            <ActionButton
              variant="destructive"
              pendingLabel="Rejecting…"
              disabled={reason.trim().length < 3}
              onAction={single(() => decide("REJECT"))}
            >
              Reject proposal
            </ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
