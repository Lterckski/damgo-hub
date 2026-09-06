import { expect, it } from "vitest";
import {
  interactionTiming,
  summarizeInteraction,
  rumRoute,
  rumTarget,
  type TimingEntry,
} from "./shared";
import { parseRumBatch } from "./validate";
export const sample = {
  kind: "vital",
  sampleId: "v6-test",
  pageId: "page-test",
  revision: 1,
  name: "INP",
  value: 240,
  route: "/tasks",
  pageRoute: "/dashboard",
  device: "mobile",
  target: "main > button:nth-of-type(2)",
  eventType: "click",
  inputDelay: 20,
  processingDuration: 100,
  presentationDelay: 120,
};
it("normalizes routes and captures structure without user text or attributes", () => {
  expect(rumRoute("/docs/private-id?query=secret#hello")).toBe("/docs/[id]");
  expect(rumRoute("/unknown/private")).toBe("/other");
  const div = document.createElement("main");
  div.innerHTML =
    '<button>First</button><button id="private-user" aria-label="Private name">Secret text</button>';
  expect(rumTarget(div.lastElementChild)).toBe("main > button:nth-of-type(2)");
});
it("computes nonnegative event breakdowns including rounded timing and sync modal clamping", () => {
  expect(
    interactionTiming({
      startTime: 100,
      duration: 240,
      processingStart: 120,
      processingEnd: 220,
    } as TimingEntry),
  ).toEqual({
    inputDelay: 20,
    processingDuration: 100,
    presentationDelay: 120,
  });
  expect(
    interactionTiming({
      startTime: 100,
      duration: 240,
      processingStart: 120,
      processingEnd: 500,
    } as TimingEntry),
  ).toEqual({ inputDelay: 20, processingDuration: 220, presentationDelay: 0 });
});
it("validates bounded samples and strips arbitrary extra payloads", () => {
  expect(
    parseRumBatch({ samples: [{ ...sample, privateData: "secret" }] }),
  ).toEqual([sample]);
  for (const change of [
    { value: NaN },
    { target: "#user-secret" },
    { route: "/docs/secret" },
    { revision: -1 },
    { eventType: "private text" },
    { eventType: ["click"] },
    { kind: ["vital"] },
    { device: ["mobile"] },
    { processingDuration: -10 },
    { kind: "interaction", value: 180 },
  ]) {
    expect(parseRumBatch({ samples: [{ ...sample, ...change }] })).toBeNull();
  }
  expect(parseRumBatch({ samples: Array(21).fill(sample) })).toBeNull();
  expect(
    parseRumBatch({ samples: [{ ...sample, eventType: "contextmenu" }] }),
  ).toEqual([{ ...sample, eventType: "contextmenu" }]);
});

it("attributes processing across pointer and click entries in the same slow frame", () => {
  const base = {
    name: "pointerdown",
    interactionId: 7,
    startTime: 100,
    duration: 320,
    processingStart: 100,
    processingEnd: 101,
  };
  expect(
    summarizeInteraction([
      base,
      { ...base, name: "click", processingStart: 102, processingEnd: 415 },
    ]),
  ).toMatchObject({
    inputDelay: 0,
    processingDuration: 315,
    presentationDelay: 5,
  });
});
