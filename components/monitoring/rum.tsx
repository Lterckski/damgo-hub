"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { startRum, trackRumRoute } from "@/lib/rum/client";
export function Rum() {
  const path = usePathname();
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_RUM_ENABLED !== "true") return;
    trackRumRoute(path);
    try {
      startRum();
    } catch {
      /* Monitoring must never break application rendering. */
    }
  }, [path]);
  return null;
}
