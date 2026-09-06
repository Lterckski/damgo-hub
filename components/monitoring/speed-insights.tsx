"use client";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { rumRoute } from "@/lib/rum/shared";
export function AppSpeedInsights() {
  if (process.env.NEXT_PUBLIC_RUM_ENABLED !== "true") return null;
  return (
    <SpeedInsights
      sampleRate={1}
      beforeSend={(event) => {
        const url = new URL(event.url);
        return {
          ...event,
          url: url.origin + rumRoute(url.pathname),
          route: rumRoute(url.pathname),
        };
      }}
    />
  );
}
