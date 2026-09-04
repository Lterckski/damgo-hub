// Shared Liveblocks configuration for the project roadmap
// (13-roadmap-board.md) and ideas board (19-ideas-board.md). See
// 12-liveblocks-setup.md. Kept generic across room types on purpose —
// nothing here is coupled to either surface.
//
// Module augmentation is Liveblocks' own documented pattern for typing
// Presence/UserMeta app-wide (every `@liveblocks/react` hook — useOthers,
// useMyPresence, etc. — picks these types up automatically once this file
// is part of the build, no explicit import needed at each call site).
declare global {
  interface Liveblocks {
    Presence: {
      cursor: { x: number; y: number } | null;
    };
    UserMeta: {
      id: string;
      info: {
        // Duplicated against the top-level `id` above on purpose — `info`
        // is meant to be self-contained for rendering (an avatar/cursor
        // component reading `other.info` shouldn't also need `other.id`
        // to know whose presence this is), even though the two are
        // always equal in this app (`id` is exactly the memberId a
        // session was prepared with — see app/api/liveblocks-auth).
        memberId: string;
        name: string;
        avatar: string;
        color: string;
      };
    };
  }
}

export {};
