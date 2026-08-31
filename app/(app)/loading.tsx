import { Loader2 } from "lucide-react";

// Shared across every route under (app) — co-located with layout.tsx, so
// Next wraps `children` in a Suspense boundary at this level and swaps this
// in the instant a nav click starts, not just on first load. Without this,
// clicking a tab left the whole page frozen with zero feedback until every
// query on the next page finished (data fetching itself was already
// parallelized per-page — see progress-tracker.md — this was a missing
// perceived-latency fix, not a query-speed one). AppShell's navbar/dock stay
// mounted and responsive throughout since only `children` suspends.
export default function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <Loader2 className="h-6 w-6 animate-spin text-copy-secondary" />
    </div>
  );
}
