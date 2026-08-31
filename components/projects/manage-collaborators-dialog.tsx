"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, X } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ProjectMemberOption } from "@/lib/projects";

interface ManageCollaboratorsDialogProps {
  projectId: string;
  ownerName: string;
  collaborators: ProjectMemberOption[];
  allMembers: ProjectMemberOption[];
  isOwner: boolean;
}

/**
 * Owner gets search-and-add plus remove; anyone else with project access
 * (a collaborator) sees the same list read-only. Same component either
 * way — just the add/remove controls are gated on `isOwner`.
 */
export function ManageCollaboratorsDialog({
  projectId,
  ownerName,
  collaborators,
  allMembers,
  isOwner,
}: ManageCollaboratorsDialogProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const collaboratorIds = useMemo(() => new Set(collaborators.map((c) => c.id)), [collaborators]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return [];
    return allMembers
      .filter((m) => !collaboratorIds.has(m.id))
      .filter((m) => m.displayName.toLowerCase().includes(q))
      .slice(0, 8);
  }, [allMembers, collaboratorIds, query]);

  async function addCollaborator(memberId: string) {
    setPendingId(memberId);
    try {
      const response = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      if (response.ok) {
        setQuery("");
        router.refresh();
      }
    } finally {
      setPendingId(null);
    }
  }

  async function removeCollaborator(memberId: string) {
    setPendingId(memberId);
    try {
      const response = await fetch(`/api/projects/${projectId}/members/${memberId}`, { method: "DELETE" });
      if (response.ok) router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setIsOpen(true)}>
        <Users className="h-3.5 w-3.5" /> Collaborators
        {collaborators.length > 0 && ` (${collaborators.length})`}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-copy-primary">Collaborators</DialogTitle>
            <DialogDescription>
              {isOwner
                ? "Search by name to add — remove anyone with the X."
                : "Owner and everyone assigned to this project."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div>
              <p className="mb-1.5 text-xs font-bold tracking-wide text-copy-primary uppercase">Owner</p>
              <p className="text-sm text-copy-secondary">{ownerName}</p>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-bold tracking-wide text-copy-primary uppercase">
                Collaborators
              </p>
              {collaborators.length === 0 ? (
                <p className="text-sm text-copy-secondary">No collaborators assigned yet.</p>
              ) : (
                <ul className="space-y-2">
                  {collaborators.map((collaborator) => (
                    <li
                      key={collaborator.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-surface-border bg-surface px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={collaborator.avatarUrl ?? undefined} />
                          <AvatarFallback className="text-[10px]">
                            {collaborator.displayName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium text-copy-primary">
                          {collaborator.displayName}
                        </span>
                      </div>
                      {isOwner && (
                        <button
                          type="button"
                          aria-label={`Remove ${collaborator.displayName}`}
                          disabled={pendingId === collaborator.id}
                          onClick={() => removeCollaborator(collaborator.id)}
                          className="text-copy-secondary hover:text-error"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {isOwner && (
              <div>
                <p className="mb-1.5 text-xs font-bold tracking-wide text-copy-primary uppercase">
                  Add a member
                </p>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name…"
                  className="text-copy-primary!"
                />
                {searchResults.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {searchResults.map((result) => (
                      <li key={result.id}>
                        <button
                          type="button"
                          disabled={pendingId === result.id}
                          onClick={() => addCollaborator(result.id)}
                          className="flex w-full items-center gap-2 rounded-xl border border-surface-border bg-surface px-3 py-2 text-left transition-colors hover:border-brand/40"
                        >
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={result.avatarUrl ?? undefined} />
                            <AvatarFallback className="text-[10px]">
                              {result.displayName.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium text-copy-primary">{result.displayName}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {query.trim() !== "" && searchResults.length === 0 && (
                  <p className="mt-2 text-xs text-copy-secondary">No matching members.</p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
