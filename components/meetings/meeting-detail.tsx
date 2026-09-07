"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Video,
  X,
} from "lucide-react";

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { BackButton } from "@/components/shared/back-button";
import { MeetingFormDialog } from "@/components/meetings/meeting-form-dialog";
import { meetingServiceLabel } from "@/lib/meeting-format";
import { useSingleFlight } from "@/hooks/use-action-guard";
import type {
  MeetingMemberOption,
  SerializedAgendaItem,
  SerializedMeeting,
} from "@/lib/meetings";

const FIELD_LABEL_CLASS =
  "mb-1.5 block text-xs font-bold tracking-wide text-copy-primary uppercase";

interface MeetingDetailProps {
  meeting: SerializedMeeting;
  members: MeetingMemberOption[];
  currentMemberId: string;
  isAdmin: boolean;
}

function initialsFor(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

async function runMeetingMutation(
  url: string,
  init: RequestInit,
  fallbackMessage: string,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error("Couldn't connect to Damgo Hub. Please try again.");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? fallbackMessage);
  }
}

/**
 * Owns the whole meeting detail page below the top nav — an asynchronous
 * planning page, not a live meeting workspace (no Liveblocks, no "Live
 * Agenda" tab, per 16-meeting-scheduling.md's explicit scope limit).
 * Every mutation calls router.refresh() rather than keeping optimistic
 * local copies of server state, matching project-detail.tsx's pattern.
 */
export function MeetingDetail({
  meeting,
  members,
  currentMemberId,
  isAdmin,
}: MeetingDetailProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [proposalText, setProposalText] = useState("");
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [isSubmittingProposal, setIsSubmittingProposal] = useState(false);

  const [newItemText, setNewItemText] = useState("");
  const [isAddingItem, setIsAddingItem] = useState(false);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [busyProposalId, setBusyProposalId] = useState<string | null>(null);

  const single = useSingleFlight();

  async function deleteMeeting() {
    setIsSaving(true);
    setActionError(null);
    try {
      await runMeetingMutation(
        `/api/meetings/${meeting.id}`,
        { method: "DELETE" },
        "Couldn't delete this meeting.",
      );
      router.push("/meetings");
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Couldn't delete this meeting.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function submitProposal() {
    if (isSubmittingProposal || proposalText.trim() === "") return;
    setIsSubmittingProposal(true);
    setProposalError(null);
    try {
      await runMeetingMutation(
        `/api/meetings/${meeting.id}/agenda-proposals`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: proposalText.trim() }),
        },
        "Couldn't submit this proposal.",
      );
      setProposalText("");
      router.refresh();
    } catch (error) {
      setProposalError(
        error instanceof Error
          ? error.message
          : "Couldn't submit this proposal.",
      );
    } finally {
      setIsSubmittingProposal(false);
    }
  }

  async function decideProposal(
    proposalId: string,
    status: "ACCEPTED" | "DECLINED",
  ) {
    setBusyProposalId(proposalId);
    setActionError(null);
    try {
      await runMeetingMutation(
        `/api/meetings/${meeting.id}/agenda-proposals/${proposalId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
        "Couldn't update this proposal.",
      );
      router.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Couldn't update this proposal.",
      );
    } finally {
      setBusyProposalId(null);
    }
  }

  async function addAgendaItem() {
    if (isAddingItem || newItemText.trim() === "") return;
    setIsAddingItem(true);
    setActionError(null);
    try {
      await runMeetingMutation(
        `/api/meetings/${meeting.id}/agenda-items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: newItemText.trim() }),
        },
        "Couldn't add this agenda item.",
      );
      setNewItemText("");
      router.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Couldn't add this agenda item.",
      );
    } finally {
      setIsAddingItem(false);
    }
  }

  async function saveAgendaItemText(itemId: string) {
    if (editingText.trim() === "") return;
    setBusyItemId(itemId);
    setActionError(null);
    try {
      await runMeetingMutation(
        `/api/meetings/${meeting.id}/agenda-items/${itemId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: editingText.trim() }),
        },
        "Couldn't save this agenda item.",
      );
      setEditingItemId(null);
      router.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Couldn't save this agenda item.",
      );
    } finally {
      setBusyItemId(null);
    }
  }

  async function moveAgendaItem(item: SerializedAgendaItem, direction: -1 | 1) {
    setBusyItemId(item.id);
    setActionError(null);
    try {
      await runMeetingMutation(
        `/api/meetings/${meeting.id}/agenda-items/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: item.position + direction }),
        },
        "Couldn't move this agenda item.",
      );
      router.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Couldn't move this agenda item.",
      );
    } finally {
      setBusyItemId(null);
    }
  }

  async function removeAgendaItem(itemId: string) {
    setBusyItemId(itemId);
    setActionError(null);
    try {
      await runMeetingMutation(
        `/api/meetings/${meeting.id}/agenda-items/${itemId}`,
        { method: "DELETE" },
        "Couldn't remove this agenda item.",
      );
      router.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Couldn't remove this agenda item.",
      );
    } finally {
      setBusyItemId(null);
    }
  }

  const pendingProposals = meeting.agendaProposals.filter(
    (p) => p.status === "PENDING",
  );
  const decidedProposals = meeting.agendaProposals.filter(
    (p) => p.status !== "PENDING",
  );

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <BackButton />
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-dim text-brand">
              <CalendarClock className="h-4 w-4" />
            </span>
            <h1 className="font-display text-3xl text-copy-primary">
              {meeting.title}
            </h1>
          </div>
          <div className="mt-2 ml-10 space-y-1 text-sm text-copy-secondary">
            <p className="font-medium">
              {format(
                new Date(meeting.scheduledAt),
                "EEEE, MMMM d, yyyy · h:mm a",
              )}
              {meeting.endsAt
                ? ` – ${format(new Date(meeting.endsAt), "h:mm a")}`
                : ""}
            </p>
            <p>Organized by {meeting.organizerName}</p>
            {meeting.location && (
              <p className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0" /> {meeting.location}
              </p>
            )}
            {meeting.meetingUrl && (
              <p className="flex items-center gap-1.5">
                <Video className="h-3.5 w-3.5 shrink-0" />
                <a
                  href={meeting.meetingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand hover:underline"
                >
                  Join via {meetingServiceLabel(meeting.meetingUrl)}
                </a>
              </p>
            )}
          </div>
        </div>

        {/* Admin-only: any admin may edit or cancel any meeting. */}
        {isAdmin && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <MeetingFormDialog
              members={members}
              currentMemberId={currentMemberId}
              meeting={meeting}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-error"
              onClick={() => setIsDeleting(true)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        )}
      </div>

      {actionError && !isDeleting && (
        <p role="alert" className="mt-4 text-sm font-medium text-error">
          {actionError}
        </p>
      )}

      {meeting.description && (
        <div className="mt-6 rounded-2xl border border-surface-border bg-surface p-6">
          <p className={FIELD_LABEL_CLASS}>Description</p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-copy-secondary">
            {meeting.description}
          </p>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-surface-border bg-surface p-6">
        <p className={FIELD_LABEL_CLASS}>Participants</p>
        <AvatarGroup>
          {meeting.participants.slice(0, 8).map((participant) => (
            <Avatar key={participant.id} className="ring-2 ring-surface">
              {participant.avatarUrl ? (
                <AvatarImage
                  src={participant.avatarUrl}
                  alt={participant.displayName}
                />
              ) : null}
              <AvatarFallback>
                {initialsFor(participant.displayName)}
              </AvatarFallback>
            </Avatar>
          ))}
          {meeting.participants.length > 8 && (
            <AvatarGroupCount>
              +{meeting.participants.length - 8}
            </AvatarGroupCount>
          )}
        </AvatarGroup>
      </div>

      {/* Proposed items — every participant can submit; Leader/Assistant
          Leader accept or decline. See 16-meeting-scheduling.md's Pages
          section. */}
      <div className="mt-6 rounded-2xl border border-surface-border bg-surface p-6">
        <p className={FIELD_LABEL_CLASS}>Proposed Items</p>

        <div className="mt-3 flex gap-2">
          <Input
            value={proposalText}
            onChange={(e) => setProposalText(e.target.value)}
            placeholder="Suggest an agenda topic…"
            className="text-copy-primary!"
          />
          <Button
            type="button"
            disabled={isSubmittingProposal || proposalText.trim() === ""}
            onClick={single(submitProposal, "submit-proposal")}
          >
            Propose
          </Button>
        </div>
        {proposalError && (
          <p className="mt-2 text-sm font-medium text-error">{proposalError}</p>
        )}

        {meeting.agendaProposals.length === 0 ? (
          <p className="mt-4 text-sm text-copy-secondary">
            No proposals yet — be the first to suggest something.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {[...pendingProposals, ...decidedProposals].map((proposal) => (
              <li
                key={proposal.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-surface-border px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-copy-primary">
                    {proposal.text}
                  </p>
                  <p className="text-xs text-copy-secondary">
                    Proposed by {proposal.proposedByName}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {proposal.status === "PENDING" && isAdmin ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-xs"
                        disabled={busyProposalId === proposal.id}
                        onClick={single(() => decideProposal(proposal.id, "ACCEPTED"), proposal.id)}
                        title="Accept"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-xs"
                        className="text-error"
                        disabled={busyProposalId === proposal.id}
                        onClick={single(() => decideProposal(proposal.id, "DECLINED"), proposal.id)}
                        title="Decline"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Badge
                      variant={
                        proposal.status === "ACCEPTED" ? "secondary" : "outline"
                      }
                      className={
                        proposal.status === "ACCEPTED"
                          ? "text-success"
                          : "text-copy-faint"
                      }
                    >
                      {proposal.status === "PENDING"
                        ? "Pending"
                        : proposal.status === "ACCEPTED"
                          ? "Accepted"
                          : "Declined"}
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Final agenda — read-only for everyone except Leader/Assistant
          Leader, who get Add/Edit/Remove/Move controls. */}
      <div className="mt-6 rounded-2xl border border-surface-border bg-surface p-6">
        <p className={FIELD_LABEL_CLASS}>Final Agenda</p>

        {meeting.agendaItems.length === 0 ? (
          <p className="mt-3 text-sm text-copy-secondary">
            No agenda items yet.
          </p>
        ) : (
          <ol className="mt-3 space-y-2">
            {meeting.agendaItems.map((item, index) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-surface-border px-3 py-2.5"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-dim text-[11px] font-bold text-brand">
                  {index + 1}
                </span>

                {editingItemId === item.id ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Input
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="text-copy-primary!"
                      autoFocus
                    />
                    <Button
                      type="button"
                      size="icon-xs"
                      disabled={busyItemId === item.id}
                      onClick={single(() => saveAgendaItemText(item.id), item.id)}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setEditingItemId(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-copy-primary">
                      {item.text}
                    </p>
                    <p className="text-xs text-copy-secondary">
                      Added by {item.addedByName}
                    </p>
                  </div>
                )}

                {isAdmin && editingItemId !== item.id && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={index === 0 || busyItemId === item.id}
                      onClick={single(() => moveAgendaItem(item, -1), item.id)}
                      title="Move up"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={
                        index === meeting.agendaItems.length - 1 ||
                        busyItemId === item.id
                      }
                      onClick={single(() => moveAgendaItem(item, 1), item.id)}
                      title="Move down"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => {
                        setEditingItemId(item.id);
                        setEditingText(item.text);
                      }}
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="text-error"
                      disabled={busyItemId === item.id}
                      onClick={single(() => removeAgendaItem(item.id), item.id)}
                      title="Remove"
                    >
                      {busyItemId === item.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        {isAdmin && (
          <div className="mt-3 flex gap-2">
            <Input
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              placeholder="Add an agenda item directly…"
              className="text-copy-primary!"
            />
            <Button
              type="button"
              disabled={isAddingItem || newItemText.trim() === ""}
              onClick={single(addAgendaItem, "add-agenda-item")}
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
        )}
      </div>

      <Dialog open={isDeleting} onOpenChange={setIsDeleting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-copy-primary">
              Delete this meeting?
            </DialogTitle>
            <DialogDescription>
              This can&apos;t be undone. Every participant gets a cancellation
              email.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsDeleting(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isSaving}
              onClick={single(deleteMeeting, "delete-meeting")}
            >
              Delete
            </Button>
          </DialogFooter>
          {actionError && (
            <p role="alert" className="text-sm font-medium text-error">
              {actionError}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
