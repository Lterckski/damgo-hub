"use client";

import { type PointerEvent, type ReactNode, useRef } from "react";
import { useMyPresence, useOthers } from "@liveblocks/react/suspense";

import { cn } from "@/lib/utils";

interface BoardCursorsProps {
  children: ReactNode;
  className?: string;
}

/**
 * Board-agnostic live-cursor overlay — see 14-presence-avatars-cursors.md.
 * Wraps a board's canvas (React Flow's <ReactFlow>), broadcasts the local
 * pointer position via Liveblocks presence on move, clears it on pointer
 * leave, and renders every *other* participant's cursor on top.
 *
 * Position is tracked in container-relative pixels (not React Flow's
 * pan/zoomed "flow space") — simplest thing that works uniformly across
 * every board surface this wraps, and cursors are a lightweight social
 * cue here, not something that needs to track a specific node's position.
 */
export function BoardCursors({ children, className }: BoardCursorsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [, updateMyPresence] = useMyPresence();
  const others = useOthers();

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    updateMyPresence({ cursor: { x: event.clientX - rect.left, y: event.clientY - rect.top } });
  }

  function handlePointerLeave() {
    updateMyPresence({ cursor: null });
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {children}

      <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
        {others.map((other) =>
          other.presence.cursor ? (
            <BoardCursor
              key={other.connectionId}
              x={other.presence.cursor.x}
              y={other.presence.cursor.y}
              name={other.info.name}
              color={other.info.color}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}

function BoardCursor({ x, y, name, color }: { x: number; y: number; name: string; color: string }) {
  return (
    <div className="absolute top-0 left-0 transition-transform duration-75 ease-out" style={{ transform: `translate(${x}px, ${y}px)` }}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="drop-shadow-sm">
        <path
          d="M2 1.5 L15.5 8 L9 9.5 L7 16 Z"
          fill={color}
          stroke="var(--bg-surface)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="ml-3.5 -mt-1 inline-block rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-white shadow-sm"
        style={{ backgroundColor: color }}
      >
        {name}
      </span>
    </div>
  );
}
