import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";

import { prisma } from "@/lib/prisma";
import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import { removeMemberFromOrg } from "@/lib/organization-roles";

// DELETE /api/members/[memberId] — org:admin (Leader or Assistant Leader)
// only. Permanently removes a member: the Leader can't be deleted (the
// seat isn't reassignable — see architecture-context.md), and an admin
// can't delete themselves. Since almost every content table points at
// Member with no cascade (a task/doc/transaction/event/project would
// otherwise block the delete outright, or need to go null and lose "who
// did this"), everything the member created is reassigned to the acting
// admin first, in the same transaction as the row deletion. Their pure
// membership links (task assignments, project collaborations, functional/
// work-distribution tags) do cascade away — those just describe the
// relationship, not authorship.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const [actingAdmin, isAdmin] = await Promise.all([
    getCurrentMember(),
    isCurrentMemberAdmin(),
  ]);
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Only Admins can delete a member" },
      { status: 403 },
    );
  }

  const { memberId } = await params;
  const target = await prisma.member.findUnique({ where: { id: memberId } });

  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  if (target.isLeader) {
    return NextResponse.json(
      { error: "The Leader can't be deleted" },
      { status: 400 },
    );
  }
  if (target.id === actingAdmin.id) {
    return NextResponse.json(
      { error: "You can't delete yourself" },
      { status: 400 },
    );
  }

  // Remove Clerk org access first — this is the guarantee that actually
  // matters (they can no longer sign in / act as this org), and it means
  // getCurrentMember() can't "resurrect" them as a fresh Member row after
  // the Postgres delete below, even if that delete somehow fails partway.
  // Tolerate them already not being a Clerk org member (e.g. this row is
  // left over from the earlier public-sign-up/duplicate-org mixup — see
  // progress-tracker.md) rather than letting that abort the whole delete;
  // any other failure still does.
  try {
    await removeMemberFromOrg(target.clerkUserId);
  } catch (error) {
    const alreadyGone = isClerkAPIResponseError(error) && error.status === 404;
    if (!alreadyGone) {
      console.error("removeMemberFromOrg failed", error);
      return NextResponse.json(
        {
          error: "Couldn't remove this member from the organization in Clerk.",
        },
        { status: 502 },
      );
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: { createdById: target.id },
        data: { createdById: actingAdmin.id },
      });
      await tx.doc.updateMany({
        where: { authorId: target.id },
        data: { authorId: actingAdmin.id },
      });
      await tx.transaction.updateMany({
        where: { memberId: target.id },
        data: { memberId: actingAdmin.id },
      });
      await tx.calendarEvent.updateMany({
        where: { createdById: target.id },
        data: { createdById: actingAdmin.id },
      });
      await tx.project.updateMany({
        where: { ownerId: target.id },
        data: { ownerId: actingAdmin.id },
      });

      // Meetings organized by the deleted member reassign to the acting
      // admin — and that admin needs a deduplicated MeetingParticipant row
      // for each one, since an organizer is always a participant (see
      // 16-meeting-scheduling.md's Permissions section). `skipDuplicates`
      // handles the admin already being a participant on some of these.
      const organizedMeetings = await tx.meeting.findMany({
        where: { organizerId: target.id },
        select: { id: true },
      });
      if (organizedMeetings.length > 0) {
        await tx.meeting.updateMany({
          where: { organizerId: target.id },
          data: { organizerId: actingAdmin.id },
        });
        await tx.meetingParticipant.createMany({
          data: organizedMeetings.map((meeting) => ({
            meetingId: meeting.id,
            memberId: actingAdmin.id,
          })),
          skipDuplicates: true,
        });
      }
      // Agenda proposals/items authored by the deleted member reassign too
      // — meeting content is preserved under the acting admin, same policy
      // as everything else in this transaction.
      await tx.agendaProposal.updateMany({
        where: { proposedById: target.id },
        data: { proposedById: actingAdmin.id },
      });
      await tx.agendaItem.updateMany({
        where: { addedById: target.id },
        data: { addedById: actingAdmin.id },
      });

      // Penalties reassign both directions — who it was issued against and
      // who issued it — same uniform policy as everything else here.
      // 18-penalty-tracker.md doesn't mention member deletion at all, but
      // Penalty.memberId/issuedById are required relations with no
      // onDelete override, so leaving this out would just turn into a raw
      // FK-constraint 500 the first time someone tried to delete a member
      // with any penalty history.
      await tx.penalty.updateMany({
        where: { memberId: target.id },
        data: { memberId: actingAdmin.id },
      });
      await tx.penalty.updateMany({
        where: { issuedById: target.id },
        data: { issuedById: actingAdmin.id },
      });

      // The deleted member's own MeetingParticipant rows cascade away via
      // the schema relation — nothing to do for those here.
      // MeetingEmailDelivery.recipientMemberId is intentionally left
      // untouched (see prisma/models/meeting.prisma) — it's immutable
      // delivery history, not current ownership.

      await tx.member.delete({ where: { id: target.id } });
    });
  } catch (error) {
    console.error("Member delete transaction failed", error);
    return NextResponse.json(
      { error: "Couldn't delete this member." },
      { status: 500 },
    );
  }

  // The cached member-picker list (lib/members.ts) needs a new member to
  // show up — it equally needs a deleted one to disappear.
  revalidateTag("members", { expire: 0 });

  return NextResponse.json({ ok: true });
}
