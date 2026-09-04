"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Trash2 } from "lucide-react";
import { useLiveblocksFlow } from "@liveblocks/react-flow";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterMultiSelect } from "@/components/shared/filter-multi-select";
import type { ProjectMemberOption } from "@/lib/projects";
import { MILESTONE_STATUS_OPTIONS, type MilestoneNode, type MilestoneStatus } from "@/types/roadmap";

const FIELD_LABEL_CLASS = "mb-1.5 block text-xs font-bold tracking-wide text-copy-primary uppercase";

// See new-task-dialog.tsx's comment — <Select.Value> needs an `items` map
// to show a label instead of the raw value before the popup has opened.
const STATUS_ITEMS = Object.fromEntries(MILESTONE_STATUS_OPTIONS.map((o) => [o.value, o.label]));

// Derived straight from useLiveblocksFlow's own return type (same
// instantiation roadmap-canvas.tsx uses) rather than hand-typed against
// @xyflow/react's OnNodesChange/OnDelete generics — those default their
// edge-type parameter to the base `Edge`, while the hook actually returns
// handlers typed against `BuiltInEdge`, and TS's strict function-type
// variance rejects the mismatch. Deriving avoids re-litigating that.
type LiveblocksFlowResult = ReturnType<typeof useLiveblocksFlow<MilestoneNode>>;

interface MilestoneEditDialogProps {
  node: MilestoneNode | null;
  onOpenChange: (open: boolean) => void;
  onNodesChange: LiveblocksFlowResult["onNodesChange"];
  onDelete: LiveblocksFlowResult["onDelete"];
  collaborators: ProjectMemberOption[];
}

/**
 * Opened by double-clicking a milestone node (wired in roadmap-canvas.tsx)
 * or right after "Add Milestone" creates one — see 13-roadmap-board.md
 * steps 5-6. Every field writes straight through `onNodesChange`'s
 * "replace" change, which flows into Liveblocks storage the same way a
 * drag or resize does — no separate save step, matching the spec.
 */
export function MilestoneEditDialog({
  node,
  onOpenChange,
  onNodesChange,
  onDelete,
  collaborators,
}: MilestoneEditDialogProps) {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<MilestoneStatus>("NOT_STARTED");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [syncedNodeId, setSyncedNodeId] = useState<string | null>(null);

  // Re-seed local draft state whenever a different node is opened for
  // editing. React's own recommended "adjust state during render" pattern
  // (see components/calendar/calendar-view.tsx's identical fix, from
  // CodeRabbit's review on the calendar-filters PR) rather than a
  // useEffect — the eslint react-hooks/set-state-in-effect rule flags a
  // setState call inside an effect body, and this is exactly the "sync
  // state to a changed prop" case it wants written this way instead. The
  // syncedNodeId comparison is what keeps this from looping: it only
  // re-seeds once per newly-opened node, not on every keystroke.
  if (node && node.id !== syncedNodeId) {
    setSyncedNodeId(node.id);
    setTitle(node.data.title);
    setStatus(node.data.status);
    setDueDate(node.data.dueDate);
    setAssigneeIds(node.data.assigneeIds);
  }

  if (!node) return null;

  function writeThrough(patch: Partial<MilestoneNode["data"]>) {
    if (!node) return;
    onNodesChange([
      {
        id: node.id,
        type: "replace",
        item: { ...node, data: { ...node.data, ...patch } },
      },
    ]);
  }

  function handleDelete() {
    if (!node) return;
    onDelete({ nodes: [node], edges: [] });
    onOpenChange(false);
  }

  const collaboratorOptions = collaborators.map((c) => ({ value: c.id, label: c.displayName }));

  return (
    <Dialog open={node !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-copy-primary">Edit Milestone</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className={FIELD_LABEL_CLASS}>Title</label>
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                writeThrough({ title: e.target.value });
              }}
              placeholder="Milestone title"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={FIELD_LABEL_CLASS}>Status</label>
              <Select
                items={STATUS_ITEMS}
                value={status}
                onValueChange={(value) => {
                  if (!value) return;
                  const next = value as MilestoneStatus;
                  setStatus(next);
                  writeThrough({ status: next });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MILESTONE_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className={FIELD_LABEL_CLASS}>Due Date</label>
              <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                <PopoverTrigger
                  render={<Button type="button" variant="outline" className="w-full justify-start font-normal" />}
                >
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {dueDate ? format(new Date(dueDate), "MMM d, yyyy") : "No due date"}
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dueDate ? new Date(dueDate) : undefined}
                    onSelect={(date) => {
                      const iso = date ? date.toISOString() : null;
                      setDueDate(iso);
                      writeThrough({ dueDate: iso });
                      setIsDatePickerOpen(false);
                    }}
                  />
                  {dueDate && (
                    <div className="border-t border-surface-border p-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setDueDate(null);
                          writeThrough({ dueDate: null });
                          setIsDatePickerOpen(false);
                        }}
                      >
                        Clear date
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div>
            <label className={FIELD_LABEL_CLASS}>Assignees</label>
            <FilterMultiSelect
              label="Select assignees"
              options={collaboratorOptions}
              selected={assigneeIds}
              onChange={(values) => {
                setAssigneeIds(values);
                writeThrough({ assigneeIds: values });
              }}
            />
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="ghost" className="text-error" onClick={handleDelete}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
