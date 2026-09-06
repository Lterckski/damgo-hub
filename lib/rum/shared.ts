export const VITAL_NAMES = ["CLS", "LCP", "INP"] as const;
export type VitalName = (typeof VITAL_NAMES)[number];
export type RumSample = {
  kind: "vital" | "interaction";
  sampleId: string;
  pageId: string;
  revision: number;
  name: VitalName;
  value: number;
  route: string;
  pageRoute: string;
  device: "mobile" | "tablet" | "desktop";
  target: string | null;
  eventType: string | null;
  inputDelay: number | null;
  processingDuration: number | null;
  presentationDelay: number | null;
};

// Never transmit record IDs, search queries, hashes or arbitrary path segments.
export function rumRoute(path: string): string {
  const parts = path.split(/[?#]/)[0].split("/").filter(Boolean);
  const root = parts[0];
  const fixed = [
    "dashboard",
    "tasks",
    "finance",
    "calendar",
    "projects",
    "docs",
    "meetings",
    "members",
    "penalties",
    "ideas",
    "records",
  ];
  if (!root) return "/";
  if (root === "admin")
    return parts.length === 1
      ? "/admin"
      : ["members", "finance", "penalties", "projects"].includes(parts[1])
        ? `/admin/${parts[1]}`
        : "/other";
  if (!fixed.includes(root)) return "/other";
  if (parts.length === 1) return `/${root}`;
  return ["projects", "docs", "meetings", "records"].includes(root)
    ? `/${root}/[id]`
    : "/other";
}

// Structural selector only: no IDs/classes/labels/text (which may contain names).
export function rumTarget(node: Node | null): string {
  if (!(node instanceof Element)) return "unknown";
  const parts: string[] = [];
  let element: Element | null = node;
  for (let depth = 0; element && depth < 5; depth++) {
    const tag = element.tagName.toLowerCase();
    const siblings: Element[] = element.parentElement
      ? Array.from(element.parentElement.children).filter(
          (e) => e.tagName === element!.tagName,
        )
      : [];
    parts.unshift(
      tag +
        (siblings.length > 1
          ? `:nth-of-type(${siblings.indexOf(element) + 1})`
          : ""),
    );
    element = element.parentElement;
  }
  return parts.join(" > ").slice(0, 300);
}

export type TimingEntry = Pick<
  PerformanceEventTiming,
  | "name"
  | "startTime"
  | "duration"
  | "processingStart"
  | "processingEnd"
  | "target"
> & { interactionId: number };
export function interactionTiming(entry: TimingEntry) {
  const start = entry.startTime;
  const processingStart = Math.max(start, entry.processingStart);
  const end = Math.max(start + entry.duration, processingStart);
  const processingEnd = Math.max(
    processingStart,
    Math.min(entry.processingEnd, end),
  );
  return {
    inputDelay: processingStart - start,
    processingDuration: processingEnd - processingStart,
    presentationDelay: end - processingEnd,
  };
}

// An interaction can produce pointerdown, pointerup and click entries in the
// same painted frame. Attribute their combined processing, not just the tiny
// pointerdown handler when its rounded duration ties the long click handler.
export function summarizeInteraction<T extends Omit<TimingEntry, "target">>(
  entries: T[],
) {
  const event = entries.reduce((best, next) =>
    next.duration > best.duration ? next : best,
  );
  const end = Math.max(event.startTime + event.duration, event.processingStart);
  const frame = entries.filter(
    (e) => e.startTime < end && e.processingEnd >= event.startTime,
  );
  return {
    event,
    ...interactionTiming({
      ...event,
      target: null,
      processingStart: Math.min(...frame.map((e) => e.processingStart)),
      processingEnd: Math.max(...frame.map((e) => e.processingEnd)),
    }),
  };
}
