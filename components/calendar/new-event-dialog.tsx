"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

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

const FIELD_LABEL_CLASS = "mb-1.5 block text-xs font-bold tracking-wide text-copy-primary uppercase";

export function NewEventDialog() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  function resetForm() {
    setTitle("");
    setStartAt("");
    setEndAt("");
  }

  async function createEvent(formData: FormData) {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: formData.get("description") || undefined,
          startAt,
          endAt: endAt || undefined,
        }),
      });
      if (response.ok) {
        setIsOpen(false);
        resetForm();
        router.refresh();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <Plus className="h-4 w-4" /> New Event
      </Button>

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-copy-primary">New Event</DialogTitle>
            <DialogDescription>
              Visible to the whole team, and synced to everyone&apos;s connected Google Calendar.
            </DialogDescription>
          </DialogHeader>

          <form action={createEvent} className="grid gap-4">
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
              <label className={FIELD_LABEL_CLASS}>Description (optional)</label>
              <Textarea name="description" rows={2} className="text-copy-primary!" />
            </div>
            <DateTimePicker label="Starts" value={startAt} onChange={setStartAt} required />
            <DateTimePicker label="Ends (optional)" value={endAt} onChange={setEndAt} />

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setIsOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || title.trim() === "" || startAt === ""}>
                Create Event
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
