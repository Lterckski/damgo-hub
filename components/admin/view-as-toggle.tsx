"use client";

import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Part 2's "View as role" toggle.
 *
 * Deliberately the same mechanism the profile menu already uses
 * (`damgo_dev_view_as_member`, read by lib/current-member.ts) rather than
 * a second one — a verification tool that behaves differently from the
 * real check verifies nothing.
 *
 * It can only ever downgrade a real admin, never grant admin, so an
 * unsigned cookie is safe here by construction. And because
 * `requireAdmin()` reads the same effective role, the API refuses admin
 * mutations while it's on: the toggle proves the server denies a member,
 * not merely that the UI hides the buttons.
 */

const COOKIE_NAME = "damgo_dev_view_as_member";

export function ViewAsToggle({ isViewingAsMember }: { isViewingAsMember: boolean }) {
  function toggle() {
    document.cookie = isViewingAsMember
      ? `${COOKIE_NAME}=; path=/; max-age=0`
      : `${COOKIE_NAME}=1; path=/; max-age=86400`;
    // A full reload, not router.refresh(): the Router Cache can hold other
    // routes' Server Component payloads from before the cookie changed.
    window.location.reload();
  }

  return (
    <Button
      variant={isViewingAsMember ? "default" : "outline"}
      size="sm"
      onClick={toggle}
      title="Re-render the app as a plain member, to verify RBAC hides what it should"
    >
      {isViewingAsMember ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      {isViewingAsMember ? "Exit member view" : "View as member"}
    </Button>
  );
}
