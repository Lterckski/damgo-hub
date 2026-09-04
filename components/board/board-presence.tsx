"use client";

import { useOthers } from "@liveblocks/react/suspense";

import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from "@/components/ui/avatar";

const MAX_VISIBLE_AVATARS = 5;

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Shared, board-agnostic "who else is here" avatar stack — see
 * 14-presence-avatars-cursors.md. Drop into a roadmap or ideas Liveblocks
 * room inside its RoomProvider/ClientSideSuspense tree; it reads presence
 * from whichever room it's rendered in.
 *
 * `useOthers()` already excludes the current member's own connection by
 * definition (it's every *other* connection in the room), so there's no
 * separate "exclude self" filter needed here.
 */
export function BoardPresence() {
  const others = useOthers();

  if (others.length === 0) return null;

  const visible = others.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = others.length - visible.length;

  return (
    <div className="pointer-events-none absolute top-4 right-4 z-20">
      <AvatarGroup className="pointer-events-auto">
        {visible.map((other) => (
          <Avatar key={other.connectionId} className="ring-2 ring-surface">
            {other.info.avatar ? <AvatarImage src={other.info.avatar} alt={other.info.name} /> : null}
            <AvatarFallback style={{ backgroundColor: other.info.color, color: "#0b1220" }}>
              {initialsFor(other.info.name)}
            </AvatarFallback>
          </Avatar>
        ))}
        {overflow > 0 && (
          <AvatarGroupCount className="ring-2 ring-surface">+{overflow}</AvatarGroupCount>
        )}
      </AvatarGroup>
    </div>
  );
}
