// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { search, visibleRecord, recordOpen } from "./search";
import { notifications, changeNotification } from "./notifications";
import type { Viewer } from "./visibility";

// Opt-in only: use an isolated DB with all migrations applied. Never reuse
// the developer's normal database or a production URL for fixture writes.
const enabled =
  process.env.HUB_INTEGRATION_TESTS === "1" &&
  /localhost:55432|127\.0\.0\.1:55432/.test(process.env.DATABASE_URL ?? "");
const prefix = `hub-test-${Date.now()}`;
const a = `${prefix}-a`,
  b = `${prefix}-b`,
  admin = `${prefix}-admin`,
  project = `${prefix}-project`;
const privateId = `${prefix}-private`,
  orgId = `${prefix}-org`,
  projectTaskId = `${prefix}-project-task`;
const alice: Viewer = {
  orgId: "test-org",
  memberId: a,
  role: "org:member",
  projectIds: [project],
};
const bob: Viewer = {
  orgId: "test-org",
  memberId: b,
  role: "org:member",
  projectIds: [],
};
const administrator: Viewer = {
  orgId: "test-org",
  memberId: admin,
  role: "org:admin",
  projectIds: [],
};
describe.skipIf(!enabled)(
  "PostgreSQL search, notification delivery and permissions",
  () => {
    beforeAll(async () => {
      await prisma.hubWorkspace.upsert({
        where: { id: "singleton" },
        create: { orgId: "test-org" },
        update: {},
      });
      for (const id of [a, b, admin]) {
        await prisma.member.create({
          data: {
            id,
            clerkUserId: id,
            email: `${id}@example.test`,
            displayName: id,
          },
        });
        await prisma.hubMembership.create({
          data: {
            orgId: "test-org",
            memberId: id,
            role: id === admin ? "org:admin" : "org:member",
          },
        });
      }
      await prisma.project.create({
        data: { id: project, name: "Private project", ownerId: a },
      });
      const dates = {
        startDate: new Date(),
        dueDate: new Date(Date.now() + 86400000),
      };
      await prisma.task.create({
        data: {
          id: privateId,
          title: `${prefix} Documentation Formatting`,
          type: "Docs",
          ...dates,
          createdById: admin,
          assignees: { create: { memberId: a } },
        },
      });
      await prisma.task.create({
        data: {
          id: orgId,
          title: `${prefix} Org task`,
          type: "Docs",
          ...dates,
          createdById: admin,
          visibilityScope: "org",
        },
      });
      await prisma.task.create({
        data: {
          id: projectTaskId,
          title: `${prefix} Project task`,
          type: "Docs",
          ...dates,
          createdById: a,
          visibilityScope: "project",
          projectId: project,
        },
      });
    });
    afterAll(async () => {
      await prisma.task.deleteMany({ where: { id: { startsWith: prefix } } });
      await prisma.doc.deleteMany({ where: { id: { startsWith: prefix } } });
      await prisma.transaction.deleteMany({
        where: { id: { startsWith: prefix } },
      });
      await prisma.project.delete({ where: { id: project } });
      await prisma.hubPreference.deleteMany({
        where: { memberId: { in: [a, b, admin] } },
      });
      await prisma.hubMembership.deleteMany({
        where: { memberId: { in: [a, b, admin] } },
      });
      await prisma.member.deleteMany({ where: { id: { in: [a, b, admin] } } });
    });
    it("creates a real assignee-only event from the task mutation", async () => {
      const own = await notifications(alice, "all");
      expect(own.items.some((n) => n.recordId === `task:${privateId}`)).toBe(
        true,
      );
      for (const viewer of [
        bob,
        administrator,
        { ...alice, orgId: "other-org" },
      ]) {
        expect(await visibleRecord(viewer, `task:${privateId}`)).toBeNull();
        expect(
          (await search(viewer, "Documentation")).some(
            (r) => r.id === `task:${privateId}`,
          ),
        ).toBe(false);
        expect(
          (await notifications(viewer, "all")).items.some(
            (n) => n.recordId === `task:${privateId}`,
          ),
        ).toBe(false);
      }
    });
    it("searches title prefixes and single-character typos", async () => {
      for (const q of [
        "doc",
        "documentatio",
        "documentatxon",
        "documentationn",
      ])
        expect(
          (await search(alice, q)).some((r) => r.id === `task:${privateId}`),
        ).toBe(true);
      expect(
        await prisma.$queryRaw`SELECT hub_one_edit('cat','ct') AS ok`,
      ).toEqual([{ ok: true }]);
    });
    it("gives project audiences to their owner and denies outsiders", async () => {
      expect(
        await visibleRecord(alice, `task:${projectTaskId}`),
      ).not.toBeNull();
      expect(await visibleRecord(bob, `task:${projectTaskId}`)).toBeNull();
      expect(
        await visibleRecord(
          { ...alice, projectIds: [] },
          `task:${projectTaskId}`,
        ),
      ).toBeNull();
    });
    it("keeps shared read and dismissed states separate", async () => {
      const notice = (await notifications(alice, "all")).items.find(
        (n) => n.recordId === `task:${orgId}`,
      )!;
      expect(notice).toBeDefined();
      await changeNotification(alice, notice.id, "read");
      expect(
        (await notifications(alice, "all")).items.find(
          (n) => n.id === notice.id,
        )?.read,
      ).toBe(true);
      expect(
        (await notifications(bob, "all")).items.find((n) => n.id === notice.id)
          ?.read,
      ).toBe(false);
      await changeNotification(alice, notice.id, "dismiss");
      expect(
        (await notifications(alice, "all")).items.find(
          (n) => n.id === notice.id,
        ),
      ).toBeUndefined();
      expect(
        (await notifications(bob, "all")).items.find((n) => n.id === notice.id),
      ).toBeDefined();
    });
    it("enforces send-time opt-out and does not replay suppressed events", async () => {
      await prisma.hubPreference.create({
        data: { orgId: "test-org", memberId: b, type: "task", enabled: false },
      });
      await prisma.$executeRaw`SELECT hub_emit(${`task:${orgId}`},'task.overdue','preference-test')`;
      await prisma.hubPreference.update({
        where: {
          orgId_memberId_type: { orgId: "test-org", memberId: b, type: "task" },
        },
        data: { enabled: true },
      });
      expect(
        (await notifications(bob, "all")).items.some(
          (n) => n.recordId === `task:${orgId}` && n.action === "task.overdue",
        ),
      ).toBe(false);
    });
    it("deduplicates retries at the database boundary", async () => {
      for (let i = 0; i < 3; i++)
        await prisma.$executeRaw`SELECT hub_emit(${`task:${orgId}`},'task.overdue','dedupe-test')`;
      expect(
        await prisma.hubNotification.count({
          where: {
            recordId: `task:${orgId}`,
            eventKey: { contains: "dedupe-test" },
          },
        }),
      ).toBe(1);
    });
    it("supports role-specific approval events and private decisions", async () => {
      const id = `${prefix}-expense`;
      await prisma.transaction.create({
        data: {
          id,
          memberId: a,
          type: "EXPENSE",
          category: "Supplies",
          amount: 1234,
        },
      });
      expect(
        (await notifications(administrator, "all")).items.some(
          (n) =>
            n.recordId === `transaction:${id}` &&
            n.action === "transaction.pending",
        ),
      ).toBe(true);
      expect(
        (await notifications(bob, "all")).items.some(
          (n) => n.recordId === `transaction:${id}`,
        ),
      ).toBe(false);
      await prisma.transaction.update({
        where: { id },
        data: { status: "APPROVED" },
      });
      expect(
        (await notifications(alice, "all")).items.some(
          (n) =>
            n.recordId === `transaction:${id}` &&
            n.action === "transaction.approved",
        ),
      ).toBe(true);
      expect(
        (await notifications(administrator, "all")).items.some(
          (n) =>
            n.recordId === `transaction:${id}` &&
            n.action === "transaction.approved",
        ),
      ).toBe(false);
    });
    it("tracks actual opens once and caps recents at twenty", async () => {
      for (let i = 0; i < 22; i++) {
        const id = `${prefix}-doc-${i}`;
        await prisma.doc.create({
          data: {
            id,
            title: `${prefix} Doc ${i}`,
            content: "Body",
            authorId: a,
          },
        });
        await recordOpen(alice, `document:${id}`);
      }
      await recordOpen(alice, `document:${prefix}-doc-21`);
      expect(await prisma.hubRecent.count({ where: { memberId: a } })).toBe(20);
      expect(
        await prisma.hubRecent.findFirst({
          where: { memberId: a, recordId: `document:${prefix}-doc-0` },
        }),
      ).toBeNull();
      await expect(recordOpen(bob, `task:${privateId}`)).rejects.toThrow();
    });
    it("preserves acceptance and avoids reissuing unchanged assignments", async () => {
      const acceptedAt = new Date("2026-09-06T00:00:00Z");
      await prisma.taskAssignee.update({
        where: { taskId_memberId: { taskId: privateId, memberId: a } },
        data: { acceptedAt },
      });
      const before = await prisma.hubNotification.count({
        where: { recordId: `task:${privateId}`, action: "task.assigned" },
      });
      await prisma.$transaction(async (tx) => {
        await tx.taskAssignee.deleteMany({
          where: { taskId: privateId, memberId: { notIn: [a] } },
        });
        await tx.taskAssignee.createMany({
          data: [{ taskId: privateId, memberId: a }],
          skipDuplicates: true,
        });
      });
      expect(
        (
          await prisma.taskAssignee.findUniqueOrThrow({
            where: { taskId_memberId: { taskId: privateId, memberId: a } },
          })
        ).acceptedAt,
      ).toEqual(acceptedAt);
      expect(
        await prisma.hubNotification.count({
          where: { recordId: `task:${privateId}`, action: "task.assigned" },
        }),
      ).toBe(before);
    });
    it("emits milestone transitions once and only to project members", async () => {
      const milestone = await prisma.projectMilestone.create({
        data: {
          projectId: project,
          title: "Ship prototype",
          dueAt: new Date(),
        },
      });
      for (let i = 0; i < 2; i++)
        await prisma.projectMilestone.update({
          where: { id: milestone.id },
          data: { blockedReason: "Waiting for parts" },
        });
      for (let i = 0; i < 2; i++)
        await prisma.projectMilestone.update({
          where: { id: milestone.id },
          data: { completedAt: new Date(), blockedReason: null },
        });
      const own = (await notifications(alice, "all")).items.filter(
        (n) => n.recordId === `project:${project}`,
      );
      expect(
        own.filter((n) => n.action === "project.milestone_blocked"),
      ).toHaveLength(1);
      expect(
        own.filter((n) => n.action === "project.milestone_reached"),
      ).toHaveLength(1);
      expect(own.some((n) => n.body === "Ship prototype completed")).toBe(true);
      expect(
        (await notifications(bob, "all")).items.some(
          (n) => n.recordId === `project:${project}`,
        ),
      ).toBe(false);
    });
    it("revokes stale recents/notifications immediately upon reassignment", async () => {
      await recordOpen(alice, `task:${privateId}`);
      await prisma.taskAssignee.update({
        where: { taskId_memberId: { taskId: privateId, memberId: a } },
        data: { memberId: b },
      });
      expect(await visibleRecord(alice, `task:${privateId}`)).toBeNull();
      expect(
        (await notifications(alice, "all")).items.some(
          (n) => n.recordId === `task:${privateId}`,
        ),
      ).toBe(false);
      expect(await visibleRecord(bob, `task:${privateId}`)).not.toBeNull();
      expect(
        (await search(bob, "Documentation")).some(
          (r) => r.id === `task:${privateId}`,
        ),
      ).toBe(true);
    });
    it("emits mentions transactionally without granting the mentioned user access", async () => {
      await prisma.hubComment.create({
        data: {
          recordId: `task:${projectTaskId}`,
          authorId: a,
          body: "Private discussion",
          mentions: [b],
        },
      });
      expect(
        (await notifications(bob, "mentions")).items.some(
          (n) => n.recordId === `task:${projectTaskId}`,
        ),
      ).toBe(false);
      await prisma.hubComment.create({
        data: {
          recordId: `task:${orgId}`,
          authorId: a,
          body: "Please review this",
          mentions: [b],
        },
      });
      const mention = (await notifications(bob, "mentions")).items.find(
        (n) => n.recordId === `task:${orgId}`,
      );
      expect(mention?.body).toBe("Please review this");
      expect(mention?.action).toBe("mention.created");
    });
    it("keeps title matches ahead of a personally owned body match", async () => {
      await prisma.doc.create({
        data: {
          id: `${prefix}-rank-title`,
          title: "Orionranking plan",
          content: "Notes",
          authorId: b,
        },
      });
      await prisma.doc.create({
        data: {
          id: `${prefix}-rank-body`,
          title: "Other document",
          content: "Orionranking plan",
          authorId: a,
        },
      });
      const rows = (await search(alice, "Orionranking")).filter(
        (r) => r.entityType === "document",
      );
      expect(rows.map((r) => r.id)).toEqual([
        `document:${prefix}-rank-title`,
        `document:${prefix}-rank-body`,
      ]);
    });
    it("preserves project-task recipients when a project is deleted", async () => {
      const deletingProject = `${prefix}-deleting-project`;
      const taskId = `${prefix}-detached-task`;
      await prisma.project.create({
        data: { id: deletingProject, name: "Temporary project", ownerId: a },
      });
      await prisma.task.create({
        data: {
          id: taskId,
          title: "Keep private on detach",
          type: "Docs",
          createdById: a,
          projectId: deletingProject,
          visibilityScope: "project",
          startDate: new Date(),
          dueDate: new Date(),
          assignees: { create: { memberId: b } },
        },
      });
      await prisma.project.delete({ where: { id: deletingProject } });
      expect(
        (await prisma.task.findUniqueOrThrow({ where: { id: taskId } }))
          .projectId,
      ).toBeNull();
      expect(await visibleRecord(alice, `task:${taskId}`)).not.toBeNull();
      expect(await visibleRecord(bob, `task:${taskId}`)).toBeNull();
      expect(await visibleRecord(administrator, `task:${taskId}`)).toBeNull();
    });
    it("limits groups after authorization and handles SQL punctuation safely", async () => {
      const rows = await search(alice, prefix);
      const counts = new Map<string, number>();
      for (const row of rows)
        counts.set(row.entityType, (counts.get(row.entityType) ?? 0) + 1);
      expect([...counts.values()].every((n) => n <= 5)).toBe(true);
      expect(await search(alice, "' ; --")).toEqual([]);
    });
  },
);
