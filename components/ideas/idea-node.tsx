"use client";

import { useEffect, useRef, useState } from "react";
import type { NodeProps } from "@xyflow/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useBoardMember } from "@/components/board/board-member-context";
import { useIdeaActions } from "@/components/ideas/idea-actions-context";
import { cn } from "@/lib/utils";
import type { IdeaNode as IdeaNodeType } from "@/types/roadmap";

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * A freeform sticky note — see 19-ideas-board.md. No connection handles,
 * no edges (this board doesn't have any), just a color cycled from the
 * shared 8-pair palette and an inline-editable text field. Double-click
 * swaps the label for a `<textarea>` in place (the "same textarea-over-
 * label pattern" the spec calls for); the milestone node's Dialog-based
 * edit doesn't apply here — a single freeform text field doesn't need a
 * separate modal the way title/status/due-date/assignees does.
 */
export function IdeaNode({ id, data, selected }: NodeProps<IdeaNodeType>) {
  const author = useBoardMember(data.authorId);
  const { commitText, autoEditNodeId, clearAutoEdit } = useIdeaActions();

  // Lazy initializer, not an effect: a brand-new note mounts a fresh
  // IdeaNode instance in the exact same render where IdeasCanvas sets
  // `autoEditNodeId` to its id (see 19-ideas-board.md step 5's "immediately
  // focused"), so reading it once at mount already gets the right answer
  // — no synchronous setState-in-effect needed to react to it.
  const [isEditing, setIsEditing] = useState(() => autoEditNodeId === id);
  const [draft, setDraft] = useState(data.text);
  // Tracks which `data.text` `draft` was last synced from, so the render-
  // time adjustment below can tell "text changed elsewhere" apart from
  // "nothing changed" — same pattern calendar-view.tsx's filter sync uses,
  // per this project's react-hooks/set-state-in-effect lint rule.
  const [syncedText, setSyncedText] = useState(data.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Picks up a text change made by someone else while this note isn't
  // being locally edited — never overwrites what the member is actively
  // typing. Adjusted during render, not in a useEffect.
  if (!isEditing && data.text !== syncedText) {
    setSyncedText(data.text);
    setDraft(data.text);
  }

  // Claims the auto-edit flag once, on mount, so IdeasCanvas's state
  // doesn't hold onto this id forever — the actual `isEditing` decision
  // already happened in the lazy initializer above; this only ever calls
  // a prop function (clearAutoEdit), never this component's own setState,
  // so it isn't the pattern react-hooks/set-state-in-effect flags.
  useEffect(() => {
    if (autoEditNodeId === id) clearAutoEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only; autoEditNodeId/clearAutoEdit are read from the closure at that moment, not tracked afterward.
  }, []);

  useEffect(() => {
    if (!isEditing) return;
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, [isEditing]);

  function commit() {
    setIsEditing(false);
    if (draft !== data.text) commitText(id, draft);
  }

  function cancel() {
    setDraft(data.text);
    setIsEditing(false);
  }

  return (
    <div
      className={cn(
        "flex min-h-[6rem] w-52 flex-col justify-between rounded-2xl p-3 shadow-sm transition-shadow",
        !isEditing && "cursor-text",
        selected && "ring-2 ring-brand ring-offset-2 ring-offset-base",
      )}
      style={{
        backgroundColor: `var(--idea-color-${data.colorIndex}-fill)`,
        color: `var(--idea-color-${data.colorIndex}-text)`,
      }}
      onDoubleClick={() => setIsEditing(true)}
      // Double-click is a pointer-only interaction — a keyboard user
      // tabbing to this note has no other way to reach edit mode after
      // its initial auto-edit session ends. role="button" + Enter/Space
      // matches the keyboard convention every other clickable card in
      // this app already gets for free from a real <button>; this one
      // can't just be a <button> since it also needs to host a <textarea>
      // once editing starts.
      role={isEditing ? undefined : "button"}
      tabIndex={isEditing ? undefined : 0}
      aria-label={isEditing ? undefined : `Edit idea: ${data.text || "empty note"}`}
      onKeyDown={(e) => {
        if (isEditing) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setIsEditing(true);
        }
      }}
    >
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="Type an idea…"
          // nodrag/nowheel — React Flow's own convention for interactive
          // content inside a node that shouldn't drag or pan the canvas.
          className="nodrag nowheel h-20 w-full resize-none bg-transparent text-sm font-medium leading-snug outline-none placeholder:opacity-60"
        />
      ) : (
        <p className="text-sm font-medium leading-snug whitespace-pre-wrap">
          {data.text || <span className="opacity-60">Double-click to add an idea…</span>}
        </p>
      )}

      <div className="mt-2 flex items-center gap-1.5 self-end">
        <Avatar size="sm" className="ring-2 ring-white/30">
          {author?.avatarUrl ? <AvatarImage src={author.avatarUrl} alt={author.displayName} /> : null}
          <AvatarFallback className="bg-white/25 text-[9px]">
            {initialsFor(author?.displayName ?? "?")}
          </AvatarFallback>
        </Avatar>
        <span className="text-[10px] font-semibold opacity-80">{author?.displayName ?? "Unknown"}</span>
      </div>
    </div>
  );
}
