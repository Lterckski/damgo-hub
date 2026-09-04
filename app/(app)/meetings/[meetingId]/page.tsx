import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import { getMemberPickerOptions } from "@/lib/members";
import { MEETING_DETAIL_INCLUDE, serializeMeeting } from "@/lib/meetings";
import { prisma } from "@/lib/prisma";
import { AccessDenied } from "@/components/shared/access-denied";
import { MeetingDetail } from "@/components/meetings/meeting-detail";

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  const [member, isAdmin] = await Promise.all([getCurrentMember(), isCurrentMemberAdmin()]);

  const meetingRecord = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: MEETING_DETAIL_INCLUDE,
  });

  if (!meetingRecord) {
    return (
      <AccessDenied
        message="This meeting doesn't exist, or you don't have access to it."
        backHref="/meetings"
        backLabel="Back to Meetings"
      />
    );
  }

  // A participant or an Admin can view — per 16-meeting-scheduling.md's
  // Permissions section. Non-participants (and non-Admins) never learn
  // whether a meeting exists at all from this response.
  const isParticipant = meetingRecord.participants.some((p) => p.member.id === member.id);
  if (!isParticipant && !isAdmin) {
    return (
      <AccessDenied
        message="This meeting doesn't exist, or you don't have access to it."
        backHref="/meetings"
        backLabel="Back to Meetings"
      />
    );
  }

  const memberOptions = await getMemberPickerOptions();

  return (
    <MeetingDetail
      meeting={serializeMeeting(meetingRecord)}
      members={memberOptions}
      currentMemberId={member.id}
      isOrganizer={meetingRecord.organizerId === member.id}
      isAdmin={isAdmin}
    />
  );
}
