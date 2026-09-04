import { getCurrentMember } from "@/lib/current-member";
import { getMemberPickerOptions } from "@/lib/members";
import { BackButton } from "@/components/shared/back-button";
import { IdeasBoard } from "@/components/ideas/ideas-board";

export default async function IdeasPage() {
  const [member, memberOptions] = await Promise.all([getCurrentMember(), getMemberPickerOptions()]);

  return (
    <div className="p-6">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="font-display text-3xl text-copy-primary">Ideas</h1>
      </div>
      <p className="mt-1 text-sm text-copy-secondary">
        A shared, open canvas — post an idea, riff on someone else&apos;s.
      </p>

      <div className="mt-6">
        <IdeasBoard currentMemberId={member.id} members={memberOptions} />
      </div>
    </div>
  );
}
