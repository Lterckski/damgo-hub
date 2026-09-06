import React from "react";
import { createRoot } from "react-dom/client";
import { RumFixture } from "./rum-fixture";
import { PerformanceFixture } from "./performance-fixture";
import { MobileLayoutFixture } from "./fixture";
import { BrowserViewport } from "@/components/chrome/browser-viewport";
import "@/app/globals.css";
createRoot(document.getElementById("root")!).render(
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
