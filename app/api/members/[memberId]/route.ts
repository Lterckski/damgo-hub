import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

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
  const [actingAdmin, isAdmin] = await Promise.all([getCurrentMember(), isCurrentMemberAdmin()]);
  if (!isAdmin) {
    return NextResponse.json({ error: "Only Admins can delete a member" }, { status: 403 });
  }

  const { memberId } = await params;
  const target = await prisma.member.findUnique({ where: { id: memberId } });

  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  if (target.isLeader) {
    return NextResponse.json({ error: "The Leader can't be deleted" }, { status: 400 });
  }
  if (target.id === actingAdmin.id) {
    return NextResponse.json({ error: "You can't delete yourself" }, { status: 400 });
  }

  // Remove Clerk org access first — this is the guarantee that actually
  // matters (they can no longer sign in / act as this org), and it means
  // getCurrentMember() can't "resurrect" them as a fresh Member row after
  // the Postgres delete below, even if that delete somehow fails partway.
  await removeMemberFromOrg(target.clerkUserId);

  await prisma.$transaction([
    prisma.task.updateMany({ where: { createdById: target.id }, data: { createdById: actingAdmin.id } }),
    prisma.doc.updateMany({ where: { authorId: target.id }, data: { authorId: actingAdmin.id } }),
    prisma.transaction.updateMany({ where: { memberId: target.id }, data: { memberId: actingAdmin.id } }),
    prisma.calendarEvent.updateMany({
      where: { createdById: target.id },
      data: { createdById: actingAdmin.id },
    }),
    prisma.project.updateMany({ where: { ownerId: target.id }, data: { ownerId: actingAdmin.id } }),
    prisma.member.delete({ where: { id: target.id } }),
  ]);

  // The cached member-picker list (lib/members.ts) needs a new member to
  // show up — it equally needs a deleted one to disappear.
  revalidateTag("members", { expire: 0 });

  return NextResponse.json({ ok: true });
}
