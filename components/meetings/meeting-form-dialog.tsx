"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "@/components/shared/date-time-picker";
import { FilterMultiSelect } from "@/components/shared/filter-multi-select";
import type { MeetingMemberOption, SerializedMeeting } from "@/lib/meetings";

const FIELD_LABEL_CLASS = "mb-1.5 block text-xs font-bold tracking-wide text-copy-primary uppercase";

interface MeetingFormDialogProps {
  /** Every member — anyone can be invited as a participant. */
  members: MeetingMemberOption[];
  currentMemberId: string;
  /** Present = edit this meeting (organizer only, enforced server-side too). Absent = create. */
  meeting?: SerializedMeeting;
}

/**
 * One dialog for both "Schedule Meeting" (list page) and "Edit" (detail
 * page, organizer only) — same fields either way, per
 * 16-meeting-scheduling.md's Pages section, just POSTing vs PATCHing.
 * Manual open-state + a plain trigger Button, matching
 * new-task-dialog.tsx's established pattern rather than a DialogTrigger.
 */
export function MeetingFormDialog({ members, currentMemberId, meeting }: MeetingFormDialogProps) {
  const router = useRouter();
  const isEdit = meeting !== undefined;

  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(meeting?.title ?? "");
  const [description, setDescription] = useState(meeting?.description ?? "");
  const [scheduledAt, setScheduledAt] = useState(meeting?.scheduledAt ?? "");
  const [endsAt, setEndsAt] = useState(meeting?.endsAt ?? "");
  const [location, setLocation] = useState(meeting?.location ?? "");
  const [meetingUrl, setMeetingUrl] = useState(meeting?.meetingUrl ?? "");
  const [participantIds, setParticipantIds] = useState<string[]>(
    meeting ? meeting.participants.map((p) => p.id) : [currentMemberId],
  );

  function resetToMeeting() {
    setTitle(meeting?.title ?? "");
    setDescription(meeting?.description ?? "");
    setScheduledAt(meeting?.scheduledAt ?? "");
    setEndsAt(meeting?.endsAt ?? "");
    setLocation(meeting?.location ?? "");
    setMeetingUrl(meeting?.meetingUrl ?? "");
    setParticipantIds(meeting ? meeting.participants.map((p) => p.id) : [currentMemberId]);
    setError(null);
  }

  async function submit() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(isEdit ? `/api/meetings/${meeting.id}` : "/api/meetings", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          scheduledAt,
          endsAt: endsAt || null,
          location,
          meetingUrl,
          participantIds,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Something went wrong.");
        return;
      }
      setIsOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't connect to Damgo Hub. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const memberOptions = members.map((m) => ({ value: m.id, label: m.displayName }));
  const canSubmit = title.trim() !== "" && scheduledAt !== "" && !isSubmitting;

  return (
    <>
      <Button
        type="button"
        variant={isEdit ? "outline" : "default"}
        size={isEdit ? "sm" : "default"}
        onClick={() => {
          resetToMeeting();
          setIsOpen(true);
        }}
      >
        {isEdit ? (
          <>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </>
        ) : (
          <>
            <Plus className="h-3.5 w-3.5" /> Schedule Meeting
          </>
        )}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-copy-primary">
              {isEdit ? "Edit Meeting" : "Schedule Meeting"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label htmlFor="meeting-title" className={FIELD_LABEL_CLASS}>Title</label>
              <Input
                id="meeting-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Weekly sync"
                className="text-copy-primary!"
              />
            </div>

            <div>
              <label htmlFor="meeting-description" className={FIELD_LABEL_CLASS}>Description (optional)</label>
              <Textarea
                id="meeting-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What's this meeting about?"
                className="text-copy-primary!"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <DateTimePicker label="Starts" value={scheduledAt} onChange={setScheduledAt} required />
              <DateTimePicker label="Ends (optional)" value={endsAt} onChange={setEndsAt} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="meeting-location" className={FIELD_LABEL_CLASS}>Location (optional)</label>
                <Input
                  id="meeting-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Room 204"
                  className="text-copy-primary!"
                />
              </div>
              <div>
                <label htmlFor="meeting-url" className={FIELD_LABEL_CLASS}>External meeting link (optional)</label>
                <Input
                  id="meeting-url"
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  placeholder="https://meet.google.com/..."
                  className="text-copy-primary!"
                />
              </div>
            </div>

            <div>
              <label htmlFor="meeting-participants" className={FIELD_LABEL_CLASS}>Participants</label>
              <FilterMultiSelect
                id="meeting-participants"
                label="Select participants"
                options={memberOptions}
                selected={participantIds}
                onChange={setParticipantIds}
              />
            </div>

            {error && <p className="text-sm font-medium text-error">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!canSubmit} onClick={submit}>
              {isEdit ? "Save" : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
