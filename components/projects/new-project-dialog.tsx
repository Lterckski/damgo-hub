"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "@/components/shared/date-time-picker";
import {
  PROJECT_CATEGORY_OPTIONS,
  PROJECT_PRIORITY_OPTIONS,
  type ProjectMemberOption,
} from "@/lib/projects";

const FIELD_LABEL_CLASS = "mb-1.5 block text-xs font-bold tracking-wide text-copy-primary uppercase";

// See new-task-dialog.tsx's comment — <Select.Value> needs an `items` map
// to show a label instead of the raw value before the popup has opened.
const PRIORITY_ITEMS = Object.fromEntries(PROJECT_PRIORITY_OPTIONS.map((o) => [o.value, o.label]));
const CATEGORY_ITEMS = Object.fromEntries(PROJECT_CATEGORY_OPTIONS.map((o) => [o.value, o.label]));

interface NewProjectDialogProps {
  members: ProjectMemberOption[];
  currentMemberId: string;
}

interface DraftLink {
  key: string;
  label: string;
  url: string;
}

/**
 * Laid out wide (`sm:max-w-2xl`) with paired columns — Description/
 * Objectives, Team Lead/Team Members — rather than one long single-column
 * stack, per the user's explicit request to fit more on one screen.
 */
export function NewProjectDialog({ members, currentMemberId }: NewProjectDialogProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [objectives, setObjectives] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetEndDate, setTargetEndDate] = useState("");
  const [priority, setPriority] = useState<string>("MEDIUM");
  const [category, setCategory] = useState<string>("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState(currentMemberId);
  const [budget, setBudget] = useState("");
  const [links, setLinks] = useState<DraftLink[]>([]);

  const ownerItems = Object.fromEntries(
    members.map((m) => [m.id, m.id === currentMemberId ? `${m.displayName} (you)` : m.displayName]),
  );

  function reset() {
    setName("");
    setDescription("");
    setObjectives("");
    setStartDate("");
    setTargetEndDate("");
    setPriority("MEDIUM");
    setCategory("");
    setMemberIds([]);
    setOwnerId(currentMemberId);
    setBudget("");
    setLinks([]);
  }

  function toggleMember(memberId: string) {
    setMemberIds((prev) => {
      const set = new Set(prev);
      if (set.has(memberId)) set.delete(memberId);
      else set.add(memberId);
      return [...set];
    });
  }

  function addLink() {
    setLinks((prev) => [...prev, { key: crypto.randomUUID(), label: "", url: "" }]);
  }

  function updateLink(key: string, patch: Partial<DraftLink>) {
    setLinks((prev) => prev.map((link) => (link.key === key ? { ...link, ...patch } : link)));
  }

  function removeLink(key: string) {
    setLinks((prev) => prev.filter((link) => link.key !== key));
  }

  async function createProject() {
    setIsSubmitting(true);
    try {
      const budgetPesos = budget.trim() === "" ? null : Number(budget);
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          objectives,
          startDate: startDate || null,
          targetEndDate: targetEndDate || null,
          priority,
          category: category || null,
          memberIds,
          ownerId,
          estimatedBudgetPesos: budgetPesos,
          links: links
            .filter((link) => link.url.trim() !== "")
            .map((link) => ({ label: link.label, url: link.url })),
        }),
      });
      if (!response.ok) return;
      const { project } = await response.json();
      setIsOpen(false);
      reset();
      router.push(`/projects/${project.id}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <Plus className="h-4 w-4" /> New Proposal
      </Button>

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) reset();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-copy-primary">New Proposal</DialogTitle>
            <DialogDescription>
              Only the name is required — fill in as much or as little else as you have right now.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div>
              <label className={FIELD_LABEL_CLASS}>
                Name <span className="text-error">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="text-copy-primary!"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={FIELD_LABEL_CLASS}>Description (optional)</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="text-copy-primary!"
                />
              </div>
              <div>
                <label className={FIELD_LABEL_CLASS}>Objectives (optional)</label>
                <Textarea
                  value={objectives}
                  onChange={(e) => setObjectives(e.target.value)}
                  rows={3}
                  placeholder="What is this project trying to achieve?"
                  className="text-copy-primary!"
                />
              </div>
            </div>

            {/* Timeline + Priority + Category */}
            <div className="rounded-xl border border-surface-border-subtle p-3">
              <div className="grid grid-cols-2 gap-3">
                <DateTimePicker
                  label="Proposed Start (optional)"
                  value={startDate}
                  onChange={setStartDate}
                  includeTime={false}
                />
                <DateTimePicker
                  label="Target End (optional)"
                  value={targetEndDate}
                  onChange={setTargetEndDate}
                  includeTime={false}
                />
                <div>
                  <label className={FIELD_LABEL_CLASS}>Priority</label>
                  <Select items={PRIORITY_ITEMS} value={priority} onValueChange={(v) => v && setPriority(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_PRIORITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className={FIELD_LABEL_CLASS}>Category (optional)</label>
                  <Select items={CATEGORY_ITEMS} value={category} onValueChange={(v) => setCategory(v ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_CATEGORY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Team Lead + Team Members */}
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-surface-border-subtle p-3">
              <div>
                <label className={FIELD_LABEL_CLASS}>Team Lead</label>
                <Select items={ownerItems} value={ownerId} onValueChange={(v) => v && setOwnerId(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.id === currentMemberId ? `${m.displayName} (you)` : m.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-copy-secondary">
                  Defaults to you. Gets full edit/delete/collaborator-management access.
                </p>
              </div>

              <div>
                <p className={FIELD_LABEL_CLASS}>Team Members / Collaborators (optional)</p>
                <div className="grid max-h-28 gap-2 overflow-y-auto rounded-lg border border-surface-border-subtle p-2">
                  {members
                    .filter((m) => m.id !== ownerId)
                    .map((m) => (
                      <label key={m.id} className="flex items-center gap-2 text-sm text-copy-primary">
                        <Checkbox checked={memberIds.includes(m.id)} onCheckedChange={() => toggleMember(m.id)} />
                        {m.displayName}
                      </label>
                    ))}
                </div>
              </div>
            </div>

            {/* Optional details — de-emphasized, no need to fill for a quick proposal */}
            <div className="rounded-xl border border-dashed border-surface-border-subtle p-3">
              <p className="mb-3 text-xs font-bold tracking-wide text-copy-faint uppercase">
                Optional details
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={FIELD_LABEL_CLASS}>Estimated Budget (PHP)</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="0.00"
                    className="text-copy-primary!"
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL_CLASS}>Supporting Links</label>
                  <Button type="button" variant="outline" size="sm" onClick={addLink}>
                    <Plus className="h-3.5 w-3.5" /> Add Link
                  </Button>
                </div>
              </div>

              {links.length > 0 && (
                <div className="mt-3 space-y-2">
                  {links.map((link) => (
                    <div key={link.key} className="flex items-center gap-2">
                      <Input
                        value={link.label}
                        onChange={(e) => updateLink(link.key, { label: e.target.value })}
                        placeholder="Label"
                        className="w-1/3 text-copy-primary!"
                      />
                      <Input
                        value={link.url}
                        onChange={(e) => updateLink(link.key, { url: e.target.value })}
                        placeholder="https://…"
                        className="flex-1 text-copy-primary!"
                      />
                      <button
                        type="button"
                        aria-label="Remove link"
                        onClick={() => removeLink(link.key)}
                        className="shrink-0 text-copy-secondary hover:text-error"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={isSubmitting || name.trim() === ""} onClick={createProject}>
                Create Proposal
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
