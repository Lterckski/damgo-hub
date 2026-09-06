import { expect, it } from "vitest";
import { assignVisibleLanes } from "./calendar-lanes";

it("preserves greedy visible placement and overflow for ties, touching endpoints and reused lanes", () => {
  const bars = Array.from({ length: 300 }, (_, i) => ({
    id: i,
    start: new Date(((i * 7) % 31) * 86400000),
    end: new Date((((i * 7) % 31) + (i % 9)) * 86400000),
  }));
  const sorted = [...bars].sort(
    (a, b) => +a.start - +b.start || +b.end - +b.start - (+a.end - +a.start),
  );
  const ends: number[] = [];
  const expected = sorted.map((bar) => {
    let lane = ends.findIndex((end) => end < +bar.start);
    if (lane === -1) lane = ends.length;
    ends[lane] = +bar.end;
    return { ...bar, lane: Math.min(lane, 3) };
  });
  expect(assignVisibleLanes(bars, 3)).toEqual(expected);
  expect(bars[0].id).toBe(0);
});

it("bounds lane comparisons even when every event overlaps", () => {
  let reads = 0;
  const bars = Array.from({ length: 10000 }, (_, id) => ({
    id,
    start: new Date(0),
    end: {
      getTime: () => {
        reads++;
        return 10;
      },
    } as Date,
  }));
  const result = assignVisibleLanes(bars, 3);
  expect(result.filter((bar) => bar.lane < 3)).toHaveLength(3);
  expect(reads).toBeLessThan(10000 * 4);
});
