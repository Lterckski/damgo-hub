"use client";

import { useEffect } from "react";

/** Keep app and portal controls inside the visible viewport when a mobile
 * keyboard opens. Pinch zoom is left to the browser, without relayout. */
export function BrowserViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    function sync() {
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
      const height = viewport?.height ?? window.innerHeight;
      root.style.setProperty("--app-viewport-height", `${height}px`);
      root.style.setProperty(
        "--app-viewport-top",
        `${viewport?.offsetTop ?? 0}px`,
      );
      const editing =
        document.activeElement?.matches(
          "input, textarea, [contenteditable='true']",
        ) ?? false;
      root.dataset.keyboardOpen = String(
        editing && window.innerHeight - height > 120,
      );
    }
    sync();
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", sync);
    return () => {
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", sync);
      root.style.removeProperty("--app-viewport-height");
      root.style.removeProperty("--app-viewport-top");
      delete root.dataset.keyboardOpen;
    };
  }, []);
  return null;
}
