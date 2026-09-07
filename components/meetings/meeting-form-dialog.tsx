"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Pencil, Plus, X } from "lucide-react";

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
import { TimeOfDaySelect } from "@/components/shared/time-of-day-select";
import {
  combineDateAndTime,
  normalizeAgendaItemDrafts,
} from "@/lib/meeting-format";
import type { MeetingMemberOption, SerializedMeeting } from "@/lib/meetings";

const FIELD_LABEL_CLASS =
  "mb-1.5 block text-xs font-bold tracking-wide text-copy-primary uppercase";
const DEFAULT_MEETING_TIME = "09:00";

interface MeetingFormDialogProps {
  /** Every member — anyone can be invited as a participant. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  members: MeetingMemberOption[];
  currentMemberId: string;
  /** Leader/Assistant Leader — gates the inline "add an agenda" builder shown while scheduling. */
  /** Present = edit this meeting (organizer only, enforced server-side too). Absent = create. */
  meeting?: SerializedMeeting;
}

/**
 * One dialog for both "Schedule Meeting" (list page) and "Edit" (detail
 * page, organizer only) — same fields either way, per
 * 16-meeting-scheduling.md's Pages section, just POSTing vs PATCHing.
 * Manual open-state + a plain trigger Button, matching
 * new-task-dialog.tsx's established pattern rather than a DialogTrigger.
 *
 * Date and time are two separate required fields (not one combined
 * picker) and there's no end-date/end-time field at all — a deliberate
 * follow-up request. `endsAt` still exists on `Meeting` and is still
 * shown read-only wherever an existing meeting already has one (the
 * detail header, the calendar) for backward compatibility; this form
 * just never displays or submits it, on create or edit.
 */
export function MeetingFormDialog({
  members,
  currentMemberId,
  meeting,
  open,
  onOpenChange,
}: MeetingFormDialogProps) {
  const router = useRouter();
  const isEdit = meeting !== undefined;

  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  function setIsOpen(value: boolean) {
    setInternalOpen(value);
    onOpenChange?.(value);
  }
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [wholeOrg, setWholeOrg] = useState(false);
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [description, setDescription] = useState(meeting?.description ?? "");
  const [meetingDate, setMeetingDate] = useState(meeting?.scheduledAt ?? "");
  const [meetingTime, setMeetingTime] = useState(
    meeting
      ? format(new Date(meeting.scheduledAt), "HH:mm")
      : DEFAULT_MEETING_TIME,
  );
  const [location, setLocation] = useState(meeting?.location ?? "");
  const [meetingUrl, setMeetingUrl] = useState(meeting?.meetingUrl ?? "");
  const [participantIds, setParticipantIds] = useState<string[]>(
    meeting ? meeting.participants.map((p) => p.id) : [currentMemberId],
  );
  // Only meaningful in create mode — see 16-meeting-scheduling.md's "Add
  // agendas while scheduling". Editing an existing meeting's agenda
  // happens on the detail page, which already has full add/edit/reorder/
  // remove controls; this dialog doesn't duplicate that in edit mode.
  const [agendaDrafts, setAgendaDrafts] = useState<string[]>([]);

  function resetToMeeting() {
    setTitle(meeting?.title ?? "");
    setDescription(meeting?.description ?? "");
    setMeetingDate(meeting?.scheduledAt ?? "");
    setMeetingTime(
      meeting
        ? format(new Date(meeting.scheduledAt), "HH:mm")
        : DEFAULT_MEETING_TIME,
    );
    setLocation(meeting?.location ?? "");
    setMeetingUrl(meeting?.meetingUrl ?? "");
    setParticipantIds(
      meeting ? meeting.participants.map((p) => p.id) : [currentMemberId],
    );
    setAgendaDrafts([]);
    setError(null);
  }

  function addAgendaDraft() {
    setAgendaDrafts((drafts) => [...drafts, ""]);
  }

  function updateAgendaDraft(index: number, value: string) {
    setAgendaDrafts((drafts) =>
      drafts.map((draft, i) => (i === index ? value : draft)),
    );
  }

  function removeAgendaDraft(index: number) {
    setAgendaDrafts((drafts) => drafts.filter((_, i) => i !== index));
  }

  async function submit() {
    if (isSubmitting) return;
    const scheduledAt = combineDateAndTime(meetingDate, meetingTime);
    if (!scheduledAt) {
      setError("Pick both a meeting date and time.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        isEdit ? `/api/meetings/${meeting.id}` : "/api/meetings",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description,
            scheduledAt,
            location,
            meetingUrl,
            participantIds,
            visibilityScope: wholeOrg ? "org" : "user",
            ...(isEdit
              ? {}
              : { agendaItems: normalizeAgendaItemDrafts(agendaDrafts) }),
          }),
        },
      );
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

  const memberOptions = members.map((m) => ({
    value: m.id,
    label: m.displayName,
  }));
  const canSubmit =
    title.trim() !== "" &&
    meetingDate !== "" &&
    meetingTime !== "" &&
    !isSubmitting;

  return (
    <>
      {open === undefined && (
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
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          {!isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={wholeOrg}
                onChange={(e) => setWholeOrg(e.target.checked)}
                className="accent-brand"
              />
              Invite the entire organization
            </label>
          )}
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-copy-primary">
              {isEdit ? "Edit Meeting" : "Schedule Meeting"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label htmlFor="meeting-title" className={FIELD_LABEL_CLASS}>
                Title
              </label>
              <Input
                id="meeting-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Weekly sync"
                className="text-copy-primary!"
              />
            </div>

            <div>
              <label
                htmlFor="meeting-description"
                className={FIELD_LABEL_CLASS}
              >
                Description (optional)
              </label>
              <Textarea
                id="meeting-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What's this meeting about?"
                className="text-copy-primary!"
              />
            </div>

            <AgendaBuilder
              isEdit={isEdit}
              drafts={agendaDrafts}
              onAdd={addAgendaDraft}
              onChange={updateAgendaDraft}
              onRemove={removeAgendaDraft}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DateTimePicker
                id="meeting-date"
                label="Meeting date"
                value={meetingDate}
                onChange={setMeetingDate}
                includeTime={false}
                required
              />
              <TimeOfDaySelect
                id="meeting-time"
                label="Meeting time"
                value={meetingTime}
                onChange={setMeetingTime}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="meeting-location" className={FIELD_LABEL_CLASS}>
                  Location (optional)
                </label>
                <Input
                  id="meeting-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Room 204"
                  className="text-copy-primary!"
                />
              </div>
              <div>
                <label htmlFor="meeting-url" className={FIELD_LABEL_CLASS}>
                  External meeting link (optional)
                </label>
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
              <label
                htmlFor="meeting-participants"
                className={FIELD_LABEL_CLASS}
              >
                Participants
              </label>
              <FilterMultiSelect
                id="meeting-participants"
                label="Select participants"
                options={memberOptions}
                selected={participantIds}
                onChange={setParticipantIds}
              />
            </div>

            {error && (
              <p className="text-sm font-medium text-error" role="alert">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={!canSubmit} onClick={submit}>
              {isSubmitting
                ? isEdit
                  ? "Saving…"
                  : "Scheduling…"
                : isEdit
                  ? "Save"
                  : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface AgendaBuilderProps {
  isEdit: boolean;
  drafts: string[];
  onAdd: () => void;
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
}

/**
 * "Add an agenda" — inline agenda-item builder for the create flow. Items
 * added here go straight onto the final agenda, which
 * 16-meeting-scheduling.md restricts to the Leader/Assistant Leader; since
 * scheduling itself is now admin-only, everyone who can reach this builder
 * already holds that authority and it needs no role prop of its own. The
 * server enforces it either way. Not rendered in edit mode — the detail
 * page owns agenda management for an existing meeting.
 */
function AgendaBuilder({
  isEdit,
  drafts,
  onAdd,
  onChange,
  onRemove,
}: AgendaBuilderProps) {
  if (isEdit) return null;

  return (
    <div>
      <label className={FIELD_LABEL_CLASS}>Agenda (optional)</label>

      {drafts.length > 0 && (
        <ul className="mb-2 space-y-2">
          {drafts.map((draft, index) => (
            <li key={index} className="flex items-center gap-2">
              <label htmlFor={`agenda-item-${index}`} className="sr-only">
                Agenda item {index + 1}
              </label>
              <span className="flex h-8 w-6 shrink-0 items-center justify-center text-xs font-bold text-copy-secondary">
                {index + 1}.
              </span>
              <Input
                id={`agenda-item-${index}`}
                value={draft}
                onChange={(e) => onChange(index, e.target.value)}
                placeholder="Agenda item"
                className="text-copy-primary!"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => onRemove(index)}
                aria-label={`Remove agenda item ${index + 1}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Only an admin can open this dialog at all, so the old disabled
          "Propose an agenda" member stand-in is unreachable and gone. */}
      <Button type="button" variant="outline" size="sm" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" /> Add an agenda
      </Button>
    </div>
  );
}
