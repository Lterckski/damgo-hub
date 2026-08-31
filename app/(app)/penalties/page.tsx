import { BackButton } from "@/components/shared/back-button";
import { ComingSoon } from "@/components/shared/coming-soon";

// 18-penalty-tracker.md hasn't been built yet — this route exists (the
// dock already links here) so visiting it says so plainly instead of
// 404ing.
export default function PenaltiesPage() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="font-display text-3xl text-copy-primary">Penalties</h1>
      </div>
      <ComingSoon feature="Penalties" />
    </div>
  );
}
