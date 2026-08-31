"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * Minimal back navigation — just an arrow, no background/border, per
 * explicit request. Rendered once in `AppShell` so it appears at the
 * top-left of every page without each page needing its own copy. Uses
 * browser history (`router.back()`), not a hardcoded destination — this is
 * "go back to wherever I came from," not a per-page "back to list" link.
 */
export function BackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="Go back"
      className="flex h-8 w-8 items-center justify-center rounded-full text-copy-secondary transition-colors hover:text-copy-primary"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  );
}
