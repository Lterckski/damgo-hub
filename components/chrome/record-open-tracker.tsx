"use client";
import { useEffect } from "react";
import { hubPost } from "./hub-client";
/** Mount only for an actual open, never for cards, prefetch or hover. */
export function RecordOpenTracker({ id }: { id: string }) {
  useEffect(() => {
    void hubPost({ action: "open", id }).catch(() => {});
  }, [id]);
  return null;
}
