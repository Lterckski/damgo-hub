"use client";

import { UserButton } from "@clerk/nextjs";
import { Eye, EyeOff } from "lucide-react";

const COOKIE_NAME = "damgo_dev_view_as_member";

interface DevUserButtonProps {
  /** Real, unsimulated admin status — whether to offer the toggle at all. */
  isRealAdmin: boolean;
  /** Whether the toggle is currently active. */
  isViewingAsMember: boolean;
}

/**
 * The navbar's profile button — for a real admin (Leader/Assistant
 * Leader), adds a "View as Member" dev toggle to Clerk's own menu via its
 * MenuItems/Action API. Everyone else just gets the plain UserButton.
 *
 * The toggle is a plain client-set cookie (lib/current-member.ts reads
 * it) rather than a Server Action — no server round trip needed for
 * something this low-stakes, and it's safe to trust as-is since
 * isCurrentMemberAdmin()/isCurrentMemberLeader() only ever let it
 * *downgrade* a real admin, never grant admin to anyone who isn't one.
 * A full reload (not router.refresh()) on toggle — the Router Cache can
 * hold other already-visited routes' Server Component payloads from
 * before the cookie changed, and this needs every route to re-evaluate
 * admin status fresh, not just whichever one you're on right now.
 */
export function DevUserButton({ isRealAdmin, isViewingAsMember }: DevUserButtonProps) {
  function toggle() {
    document.cookie = isViewingAsMember
      ? `${COOKIE_NAME}=; path=/; max-age=0`
      : `${COOKIE_NAME}=1; path=/; max-age=86400`;
    window.location.reload();
  }

  if (!isRealAdmin) return <UserButton />;

  return (
    <UserButton>
      <UserButton.MenuItems>
        <UserButton.Action
          label={isViewingAsMember ? "Exit Member view (dev)" : "View as Member (dev)"}
          labelIcon={isViewingAsMember ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          onClick={toggle}
        />
      </UserButton.MenuItems>
    </UserButton>
  );
}
