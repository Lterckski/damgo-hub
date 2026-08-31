"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

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
import { DateTimePicker } from "@/components/shared/date-time-picker";
import type { SerializedCalendarEvent } from "@/lib/calendar";

const FIELD_LABEL_CLASS = "mb-1.5 block text-xs font-bold tracking-wide text-copy-primary uppercase";

interface EventDetailDialogProps {
  event: SerializedCalendarEvent;
  canEdit: boolean;
  onClose: () => void;
}

export function EventDetailDialog({ event, canEdit, onClose }: EventDetailDialogProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [startAt, setStartAt] = useState(event.startAt);
  const [endAt, setEndAt] = useState(event.endAt ?? "");

  async function saveEvent(formData: FormData) {
    setIsSaving(true);
    try {
      await fetch(`/api/calendar/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: formData.get("description") || "",
          startAt,
          endAt: endAt || "",
        }),
      });
      onClose();
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteEvent() {
    setIsSaving(true);
    try {
      await fetch(`/api/calendar/events/${event.id}`, { method: "DELETE" });
      onClose();
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-copy-primary">
            {canEdit ? "Edit Event" : event.title}
          </DialogTitle>
          <DialogDescription>
            {canEdit
              ? "Only you (as creator) or an Admin can change this."
              : `Created by ${event.createdByName}`}
          </DialogDescription>
        </DialogHeader>

        {canEdit ? (
          <form action={saveEvent} className="grid gap-4">
            <div>
              <label className={FIELD_LABEL_CLASS}>
                Title <span className="text-error">*</span>
              </label>
              <Input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-copy-primary!"
              />
            </div>
            <div>
              <label className={FIELD_LABEL_CLASS}>Description</label>
              <Textarea
                name="description"
                defaultValue={event.description ?? ""}
                rows={2}
                className="text-copy-primary!"
              />
            </div>
            <DateTimePicker label="Starts" value={startAt} onChange={setStartAt} required />
            <DateTimePicker label="Ends" value={endAt} onChange={setEndAt} />

            <DialogFooter className="justify-between">
              <Button
                type="button"
                variant="ghost"
                className="text-error"
                disabled={isSaving}
                onClick={deleteEvent}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving || title.trim() === "" || startAt === ""}>
                  Save
                </Button>
              </div>
            </DialogFooter>
          </form>
        ) : (
          <p className="text-sm text-copy-secondary">{event.description ?? "No description."}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
