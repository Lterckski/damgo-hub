import { prisma } from "@/lib/prisma";
import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import { getMemberPickerOptions } from "@/lib/members";
import {
  MEETING_LIST_INCLUDE,
  meetingVisibilityWhere,
  serializeMeetingListItem,
  splitMeetingsByTime,
} from "@/lib/meetings";
import { BackButton } from "@/components/shared/back-button";
import { MeetingsList } from "@/components/meetings/meetings-list";

export default async function MeetingsPage() {
  const [member, isAdmin] = await Promise.all([getCurrentMember(), isCurrentMemberAdmin()]);

  const [meetingRecords, memberOptions] = await Promise.all([
    prisma.meeting.findMany({
      where: meetingVisibilityWhere(member.id, isAdmin),
      include: MEETING_LIST_INCLUDE,
      orderBy: { scheduledAt: "desc" },
    }),
    getMemberPickerOptions(),
  ]);

  const meetings = meetingRecords.map(serializeMeetingListItem);
  const { upcoming, past } = splitMeetingsByTime(meetings);

  return (
    <div className="p-6">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="font-display text-3xl text-copy-primary">Meetings</h1>
      </div>
      <p className="mt-1 text-sm text-copy-secondary">
        Schedule meetings, invite the team, and plan the agenda ahead of time.
      </p>

      <div className="mt-6">
        <MeetingsList
          upcoming={upcoming}
          past={past}
          members={memberOptions}
          currentMemberId={member.id}
        />
      </div>
    </div>
  );
}
