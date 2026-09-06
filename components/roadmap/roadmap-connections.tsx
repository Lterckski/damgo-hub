"use client";
import { useState } from "react";
import type { Connection, Edge } from "@xyflow/react";
import { Link2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { MilestoneNode } from "@/types/roadmap";

/** Equivalent to drawing/removing edges, usable without a drag gesture. */
export function RoadmapConnections({
  nodes,
  edges,
  onConnect,
  onRemove,
}: {
  nodes: MilestoneNode[];
  edges: Edge[];
  onConnect: (connection: Connection) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [message, setMessage] = useState("");
  const valid =
    nodes.some((n) => n.id === source) &&
    nodes.some((n) => n.id === target) &&
    source !== target &&
    !edges.some((e) => e.source === source && e.target === target);
  const title = (id: string) =>
    nodes.find((n) => n.id === id)?.data.title || "Untitled milestone";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button type="button" size="sm" variant="outline" />}
      >
        <Link2 className="h-4 w-4" /> Connections
      </DialogTrigger>
      <DialogContent className="rounded-3xl sm:max-w-lg">
        <DialogTitle>Milestone connections</DialogTitle>
        <DialogDescription>
          Choose the milestones to connect. You can also remove an existing
          connection.
        </DialogDescription>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onConnect({
              source,
              target,
              sourceHandle: "right-source",
              targetHandle: "left-target",
            });
            setMessage("Connection added");
            setTarget("");
          }}
        >
          <label className="grid gap-1 text-sm font-medium">
            From milestone
            <select
              aria-label="From milestone"
              className="min-h-11 w-full min-w-0 rounded-lg border border-surface-border bg-surface px-3 text-copy-primary"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="">Choose a milestone</option>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {title(n.id)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            To milestone
            <select
              aria-label="To milestone"
              className="min-h-11 w-full min-w-0 rounded-lg border border-surface-border bg-surface px-3 text-copy-primary"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Choose a milestone</option>
              {nodes
                .filter((n) => n.id !== source)
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {title(n.id)}
                  </option>
                ))}
            </select>
          </label>
          <Button type="submit" disabled={!valid}>
            Add connection
          </Button>
        </form>
        <p role="status" className="text-sm text-copy-secondary">
          {message ||
            (nodes.length < 2
              ? "Add at least two milestones to connect them."
              : "")}
        </p>
        <ul className="space-y-2">
          {edges.map((edge) => (
            <li
              key={edge.id}
              className="flex items-center gap-2 rounded-xl border border-surface-border p-2"
            >
              <span className="min-w-0 flex-1 break-words text-sm">
                {title(edge.source)} → {title(edge.target)}
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Remove connection from ${title(edge.source)} to ${title(edge.target)}`}
                onClick={() => {
                  onRemove(edge.id);
                  setMessage("Connection removed");
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
