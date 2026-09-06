/** Only visible lanes need distinct assignments; overflow shares the cap index. */
export function assignVisibleLanes<T extends { start: Date; end: Date }>(
  bars: T[],
  maxLanes: number,
): (T & { lane: number })[] {
  const sorted = [...bars].sort(
    (a, b) =>
      a.start.getTime() - b.start.getTime() ||
      b.end.getTime() -
        b.start.getTime() -
        (a.end.getTime() - a.start.getTime()),
  );
  const laneEnds: number[] = [];
  return sorted.map((bar) => {
    const start = bar.start.getTime();
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] >= start) lane++;
    if (lane < maxLanes) laneEnds[lane] = bar.end.getTime();
    return { ...bar, lane };
  });
}
