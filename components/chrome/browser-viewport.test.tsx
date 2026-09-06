import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { BrowserViewport } from "./browser-viewport";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("resizes to the keyboard viewport and cleans up on unmount", () => {
  const viewport = Object.assign(new EventTarget(), {
    height: 760,
    offsetTop: 0,
    scale: 1,
  });
  vi.stubGlobal("visualViewport", viewport);
  const { unmount } = render(
    <>
      <BrowserViewport />
      <input aria-label="Message" />
    </>,
  );
  document.querySelector("input")!.focus();
  viewport.height = 400;
  viewport.offsetTop = 25;
  viewport.dispatchEvent(new Event("resize"));
  expect(
    document.documentElement.style.getPropertyValue("--app-viewport-height"),
  ).toBe("400px");
  expect(document.documentElement.dataset.keyboardOpen).toBe("true");
  unmount();
  expect(
    document.documentElement.style.getPropertyValue("--app-viewport-height"),
  ).toBe("");
  expect(document.documentElement.dataset.keyboardOpen).toBeUndefined();
});
it("does not relayout the app during pinch zoom", () => {
  const viewport = Object.assign(new EventTarget(), {
    height: 760,
    offsetTop: 0,
    scale: 1,
  });
  vi.stubGlobal("visualViewport", viewport);
  render(<BrowserViewport />);
  viewport.scale = 2;
  viewport.height = 380;
  viewport.dispatchEvent(new Event("resize"));
  expect(
    document.documentElement.style.getPropertyValue("--app-viewport-height"),
  ).toBe("760px");
});
