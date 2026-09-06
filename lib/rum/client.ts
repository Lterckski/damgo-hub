import {
  onCLS,
  onINP,
  onLCP,
  type Metric,
  type INPMetricWithAttribution,
} from "web-vitals/attribution";
import {
  summarizeInteraction,
  rumRoute,
  rumTarget,
  type RumSample,
  type TimingEntry,
} from "./shared";

let started = false;
let routes: { at: number; route: string }[] = [];
export function trackRumRoute(path: string) {
  const route = rumRoute(path);
  if (routes.at(-1)?.route !== route)
    routes.push({ at: performance.now(), route });
  if (routes.length > 200) routes = routes.slice(-200);
}

export function startRum() {
  if (started) return;
  started = true;
  let pageId = crypto.randomUUID();
  let pageRoute = rumRoute(location.pathname);
  let revision = 0;
  const device: RumSample["device"] =
    innerWidth < 768 ? "mobile" : innerWidth < 1024 ? "tablet" : "desktop";
  const queue = new Map<string, RumSample>();
  let dropped = 0;
  const routeAt = (at: number) =>
    routes.findLast((r) => r.at <= at)?.route ?? pageRoute;
  function enqueue(sample: RumSample) {
    const key = `${sample.pageId}:${sample.kind}:${sample.sampleId}`;
    const previous = queue.get(key);
    if (
      sample.kind === "interaction" &&
      previous &&
      previous.value > sample.value
    )
      return;
    if (queue.size >= 100 && !queue.has(key)) {
      dropped++;
      return;
    }
    queue.set(key, sample);
  }
  function report(metric: Metric | INPMetricWithAttribution) {
    const inp =
      metric.name === "INP"
        ? (metric as INPMetricWithAttribution).attribution
        : undefined;
    const event = metric.entries.find((e) => "interactionId" in e) as
      | TimingEntry
      | undefined;
    enqueue({
      kind: "vital",
      sampleId: metric.id,
      pageId,
      revision: ++revision,
      name: metric.name as RumSample["name"],
      value: metric.value,
      pageRoute,
      route: inp
        ? routeAt(inp.interactionTime ?? event?.startTime ?? 0)
        : pageRoute,
      device,
      target: inp?.interactionTarget ?? null,
      eventType: event?.name ?? null,
      inputDelay: inp?.inputDelay ?? null,
      processingDuration: inp?.processingDuration ?? null,
      presentationDelay: inp?.presentationDelay ?? null,
    });
  }
  onCLS(report, { reportAllChanges: true });
  onLCP(report, { reportAllChanges: true });
  onINP(report, { reportAllChanges: true, generateTarget: rumTarget });

  // onINP emits INP candidates, not every interaction. Observe slow events
  // independently and retain the longest event per interaction ID on the server.
  type StoredTiming = Omit<TimingEntry, "target"> & { targetLabel: string };
  const interactions = new Map<number, StoredTiming[]>();
  let observer: PerformanceObserver | undefined;
  if (
    typeof PerformanceObserver !== "undefined" &&
    PerformanceObserver.supportedEntryTypes.includes("event")
  ) {
    observer = new PerformanceObserver((list) => collect(list.getEntries()));
    observer.observe({
      type: "event",
      buffered: true,
      durationThreshold: 16,
    } as PerformanceObserverInit);
  }
  function collect(entries: PerformanceEntry[]) {
    const changed = new Set<number>();
    for (const item of entries) {
      const event = item as unknown as TimingEntry;
      if (!event.interactionId) continue;
      const stored = interactions.get(event.interactionId) ?? [];
      stored.push({
        name: event.name,
        startTime: event.startTime,
        duration: event.duration,
        processingStart: event.processingStart,
        processingEnd: event.processingEnd,
        interactionId: event.interactionId,
        targetLabel: rumTarget(event.target),
      });
      // Keep only timing summaries, never DOM references, with bounded history.
      interactions.set(event.interactionId, stored.slice(-12));
      changed.add(event.interactionId);
    }
    for (const id of changed) {
      const summary = summarizeInteraction(interactions.get(id)!);
      const { event, inputDelay, processingDuration, presentationDelay } =
        summary;
      if (event.duration <= 200) continue;
      enqueue({
        kind: "interaction",
        sampleId: String(id),
        pageId,
        revision: ++revision,
        name: "INP",
        value: event.duration,
        route: routeAt(event.startTime),
        pageRoute,
        device,
        target: event.targetLabel,
        eventType: event.name,
        inputDelay,
        processingDuration,
        presentationDelay,
      });
    }
    while (interactions.size > 200)
      interactions.delete(interactions.keys().next().value!);
  }
  function flush() {
    if (!queue.size) return;
    const samples = [...queue.values()].slice(0, 20);
    const body = JSON.stringify({
      samples,
      dropped,
      release:
        process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
        process.env.NEXT_PUBLIC_RUM_RELEASE ||
        "unversioned",
    });
    let sent = false;
    try {
      sent =
        navigator.sendBeacon?.(
          "/api/rum",
          new Blob([body], { type: "application/json" }),
        ) ?? false;
    } catch {
      /* Fall back if the browser rejects beacon transport. */
    }
    if (!sent) {
      // No UI awaits telemetry. A rejected keepalive is best effort, like beacon.
      void fetch("/api/rum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
    for (const sample of samples)
      queue.delete(`${sample.pageId}:${sample.kind}:${sample.sampleId}`);
  }
  setInterval(flush, 15000);
  const flushAll = () => {
    collect(observer?.takeRecords() ?? []);
    while (queue.size) flush();
  };
  // web-vitals has registered its hidden listeners first; flush after callbacks.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") queueMicrotask(flushAll);
  });
  window.addEventListener("pagehide", flushAll);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      interactions.clear();
      pageId = crypto.randomUUID();
      pageRoute = rumRoute(location.pathname);
      routes = [];
      trackRumRoute(location.pathname);
    }
  });
}
