"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronUp, Lightbulb, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import type { RankedIdea } from "@/lib/dashboard/ideas";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { CardEmptyState, PanelCard } from "@/components/dashboard/panel-card";

/**
 * Row 6 — top ideas by vote, with inline upvoting.
 *
 * Only rendered when Vercel Blob is configured, because idea text lives in
 * the board's Blob snapshot (lib/dashboard/ideas.ts). The card this
 * replaces shipped without that check and could only ever show "No ideas
 * posted yet" in production — a permanent empty state that read as "nobody
 * has ideas" rather than "this isn't wired up".
 *
 * Voting is optimistic and idempotent per member (a composite unique on
 * ideaNodeId + memberId), so a double-click can't double-count.
 */
export function IdeasCard({ ideas }: { ideas: RankedIdea[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [overrides, setOverrides] = React.useState<Record<string, { voted: boolean; delta: number }>>({});

  async function toggle(idea: RankedIdea) {
    const current = overrides[idea.ideaNodeId];
    const wasVoted = current ? current.voted : idea.votedByMe;
    const nextVoted = !wasVoted;

    setOverrides((existing) => ({
      ...existing,
      [idea.ideaNodeId]: { voted: nextVoted, delta: nextVoted ? 1 : -1 },
    }));

    const response = await fetch("/api/dashboard/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ideaNodeId: idea.ideaNodeId }),
    }).catch(() => null);

    if (!response?.ok) {
      setOverrides((existing) => {
        const next = { ...existing };
        delete next[idea.ideaNodeId];
        return next;
      });
      toast({ message: "Couldn't register that vote", tone: "error" });
      return;
    }

    router.refresh();
  }

  return (
    <PanelCard
      title="Ideas"
      icon={Lightbulb}
      emphasis="secondary"
      headerAside={
        <Button size="sm" variant="outline" render={<Link href="/ideas" />}>
          <Plus className="h-3.5 w-3.5" />
          New idea
        </Button>
      }
      footerHref="/ideas"
      footerLabel="Open ideas board"
    >
      {ideas.length === 0 ? (
        <CardEmptyState
          message="No ideas on the board yet. Post one and the team can vote it up."
          action={
            <Button size="sm" render={<Link href="/ideas" />}>
              <Plus className="h-4 w-4" />
              Open the board
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {ideas.map((idea) => {
            const override = overrides[idea.ideaNodeId];
            const voted = override ? override.voted : idea.votedByMe;
            const count = idea.voteCount + (override?.delta ?? 0);

            return (
              <li key={idea.ideaNodeId} className="flex items-start gap-2.5">
                <button
                  type="button"
                  onClick={() => toggle(idea)}
                  aria-pressed={voted}
                  aria-label={voted ? `Remove vote from ${idea.text}` : `Upvote ${idea.text}`}
                  className={cn(
                    "flex w-9 shrink-0 flex-col items-center rounded-lg border px-1 py-0.5 transition-colors",
                    voted
                      ? "border-brand bg-accent-dim text-brand"
                      : "border-surface-border text-copy-muted hover:border-brand/50 hover:text-brand",
                  )}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-semibold tabular-nums">{count}</span>
                </button>

                <div className="min-w-0 flex-1">
                  <p className="text-sm text-copy-primary">{idea.text}</p>
                  <p className="truncate text-xs text-copy-muted">{idea.authorName}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PanelCard>
  );
}
