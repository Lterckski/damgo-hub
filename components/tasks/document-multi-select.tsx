"use client";

import { useMemo, useState } from "react";
import { FileText, Search, X } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { TaskDocOption } from "@/lib/tasks";

interface DocumentMultiSelectProps {
  docs: TaskDocOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Sorts matching-project docs first — doesn't filter them out, see the callers. */
  activeProjectId?: string;
}

/**
 * Searchable multi-select for "Related Documents" — a plain checkbox list
 * doesn't scale once there are more than a handful of docs, per explicit
 * request ("there will be a lot of documents in this project"). Built on
 * the new `components/ui/popover.tsx` (added via the shadcn CLI, not
 * hand-written — code-standards.md's "use the CLI for new components"),
 * kept open (`open`/`onOpenChange` controlled) while checking multiple
 * items, since a self-closing-per-click menu would make multi-select
 * miserable.
 */
export function DocumentMultiSelect({ docs, selectedIds, onChange, activeProjectId }: DocumentMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const sortedDocs = useMemo(() => {
    if (!activeProjectId) return docs;
    return [...docs].sort(
      (a, b) => Number(b.projectId === activeProjectId) - Number(a.projectId === activeProjectId),
    );
  }, [docs, activeProjectId]);

  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return sortedDocs;
    return sortedDocs.filter((doc) => doc.title.toLowerCase().includes(q));
  }, [sortedDocs, query]);

  const selectedDocs = docs.filter((doc) => selectedIds.includes(doc.id));

  function toggle(docId: string) {
    onChange(selectedIds.includes(docId) ? selectedIds.filter((id) => id !== docId) : [...selectedIds, docId]);
  }

  function remove(docId: string) {
    onChange(selectedIds.filter((id) => id !== docId));
  }

  return (
    <div>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm text-copy-secondary transition-colors hover:border-ring"
            />
          }
        >
          <span className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            {selectedIds.length > 0 ? `${selectedIds.length} selected` : "Select documents…"}
          </span>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-80 p-0">
          <div className="flex items-center gap-1.5 border-b border-surface-border-subtle px-2.5 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-copy-secondary" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents…"
              className="w-full bg-transparent text-sm text-copy-primary outline-none placeholder:text-copy-secondary"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1.5">
            {filteredDocs.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-copy-secondary">No matching documents.</p>
            ) : (
              filteredDocs.map((doc) => (
                <label
                  key={doc.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-copy-primary hover:bg-subtle",
                    doc.projectId === activeProjectId && activeProjectId && "font-medium",
                  )}
                >
                  <Checkbox checked={selectedIds.includes(doc.id)} onCheckedChange={() => toggle(doc.id)} />
                  <span className="truncate">{doc.title}</span>
                </label>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      {selectedDocs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedDocs.map((doc) => (
            <span
              key={doc.id}
              className="flex items-center gap-1 rounded-full bg-accent-dim px-2 py-0.5 text-xs font-medium text-brand"
            >
              {doc.title}
              <button
                type="button"
                aria-label={`Remove ${doc.title}`}
                onClick={() => remove(doc.id)}
                className="text-brand hover:text-copy-primary"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
