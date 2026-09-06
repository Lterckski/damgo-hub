import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { RumFixture } from "./rum-fixture";
import { PerformanceFixture } from "./performance-fixture";
import { MobileLayoutFixture } from "./fixture";
import { BrowserViewport } from "@/components/chrome/browser-viewport";
import "@/app/globals.css";
const root = document.getElementById("root")!;
const hydrationRoute = root.dataset.hydrationRoute;

async function hydrateFixture() {
  performance.mark("damgo-hydration-start");
  const Component =
    hydrationRoute === "dashboard"
      ? (await import("./dashboard-hydration-fixture"))
          .DashboardHydrationFixture
      : (await import("./admin-hydration-fixture")).AdminHydrationFixture;
  hydrateRoot(root, <Component />);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => performance.mark("damgo-hydration-end")),
  );
}

if (hydrationRoute) {
  void hydrateFixture();
} else createRoot(root).render(
  <>
    <BrowserViewport />
    {new URLSearchParams(location.search).has("performance") ? (
      <PerformanceFixture />
    ) : new URLSearchParams(location.search).has("rum") ? (
      <RumFixture />
    ) : (
      <MobileLayoutFixture />
    )}
  </>,
);

document.documentElement.style.setProperty(
  "--font-geist-sans",
  "Arial, sans-serif",
);
