import { BackButton } from "@/components/shared/back-button";
import { ComingSoon } from "@/components/shared/coming-soon";

// 16-meeting-scheduling.md / 17-meeting-agenda-board.md haven't been built
// yet — this route exists (the dock already links here) so visiting it
// says so plainly instead of 404ing.
export default function MeetingsPage() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="font-display text-3xl text-copy-primary">Meetings</h1>
      </div>
      <ComingSoon feature="Meetings" />
    </div>
  );
}
