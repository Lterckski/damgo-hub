import { BackButton } from "@/components/shared/back-button";
import { ComingSoon } from "@/components/shared/coming-soon";

// 19-ideas-board.md hasn't been built yet — this route exists (the dock
// and the dashboard's "Recent Ideas" widget both link here) so visiting it
// says so plainly instead of 404ing.
export default function IdeasPage() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="font-display text-3xl text-copy-primary">Ideas</h1>
      </div>
      <ComingSoon feature="The ideas board" />
    </div>
  );
}
