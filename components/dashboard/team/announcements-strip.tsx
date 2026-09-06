"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Megaphone, X } from "lucide-react";

import { agoLabel } from "@/lib/dashboard/relative-time";
import type { AnnouncementRow } from "@/lib/dashboard/team";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Row 9 — admin-pinned notices, dismissed per member.
 *
 * Dismissal is one of only two things a member may change on Team Overview
 * (the other is an idea vote), and it changes nothing anyone else sees —
 * which is exactly why announcements are their own model rather than a
 * Broadcast: one person reading a broadcast marks it read for them, but
 * one person dismissing a shared notice must not take it down for the team.
 *
 * Renders nothing at all when there's nothing pinned. An empty
 * "Announcements" heading is a hole with a label on it.
 */
export function AnnouncementsStrip({ announcements }: { announcements: AnnouncementRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());

  const live = announcements.filter((announcement) => !dismissed.has(announcement.id));
  if (live.length === 0) return null;

  async function dismiss(id: string) {
    // Optimistic — dismissing is trivially reversible by an admin
    // re-pinning, and the row vanishing instantly is the whole point.
    setDismissed((current) => new Set(current).add(id));

    const response = await fetch("/api/dashboard/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ announcementId: id }),
    }).catch(() => null);

    if (!response?.ok) {
      setDismissed((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      toast({ message: "Couldn't dismiss that", tone: "error" });
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {live.map((announcement) => (
        <div
          key={announcement.id}
          className="flex items-start gap-3 rounded-xl bg-accent-dim px-4 py-3 ring-1 ring-brand/20"
        >
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-copy-primary">{announcement.title}</p>
            <p className="mt-0.5 text-sm whitespace-pre-wrap text-copy-secondary">
              {announcement.body}
            </p>
            <p className="mt-1 text-[10px] text-copy-muted">
              {announcement.authorName} · {agoLabel(announcement.createdAt)}
            </p>
          </div>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Dismiss ${announcement.title}`}
            onClick={() => dismiss(announcement.id)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
