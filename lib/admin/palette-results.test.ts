import { expect, it } from "vitest";
import type { SearchEntry } from "./search";
import { findPaletteResults } from "./palette-results";

it("matches the previous stable ranking, including late prefix matches", () => {
  const entries: SearchEntry[] = Array.from({ length: 500 }, (_, id) => ({
    id: String(id),
    title:
      id > 480 ? `Alpha ${id}` : id % 3 ? `Name alpha ${id}` : `Name ${id}`,
    keywords: `name alpha ${id}`,
    group: "Members",
    subtitle: "",
    drawer: { kind: "members", recordId: String(id) },
  }));
  const rank = (e: SearchEntry) =>
    e.title.toLowerCase().startsWith("alpha")
      ? 0
      : e.title.toLowerCase().includes("alpha")
        ? 1
        : 2;
  expect(findPaletteResults(entries, " ALPHA ")).toEqual(
    [...entries].sort((a, b) => rank(a) - rank(b)).slice(0, 24),
  );
  expect(findPaletteResults(entries, "missing")).toEqual([]);
  expect(findPaletteResults(entries, "  ")).toEqual([]);
});
