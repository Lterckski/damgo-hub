// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const updateMany = vi.fn();
const transaction = vi.fn();
const recordAuditEvent = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findUnique: (...args: unknown[]) => findUnique(...args),
    },
    $transaction: (fn: (tx: unknown) => unknown) => transaction(fn),
  },
}));
vi.mock("@/lib/hub/context", () => ({
  entityVisibilityWhere: async () => ({}),
}));
vi.mock("@/lib/audit-log", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/audit-log")>("@/lib/audit-log");
  return {
    ...actual,
    recordAuditEvent: (...args: unknown[]) => recordAuditEvent(...args),
  };
});

import { decideProject } from "./project-decisions";

const actor = { id: "m1", displayName: "Dira", clerkUserId: "user_1" };

/** Runs the callback against a tx whose updateMany is the shared spy. */
function runTransaction() {
  transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn({ project: { updateMany }, }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  runTransaction();
  updateMany.mockResolvedValue({ count: 1 });
});

describe("decideProject", () => {
  it("approves a PROPOSED project and audits the decision", async () => {
    findUnique.mockResolvedValue({
      id: "p1",
      name: "Hack the planet",
      status: "PROPOSED",
      ownerId: "m2",
    });

    const outcome = await decideProject(actor, "p1", "APPROVE", null);

    expect(outcome).toMatchObject({ ok: true, status: "ACTIVE" });
    expect(updateMany).toHaveBeenCalledWith({
      // The status guard is repeated in the write, so two concurrent
      // decisions cannot both apply.
      where: { id: "p1", status: "PROPOSED" },
      data: { status: "ACTIVE" },
    });
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent.mock.calls[0][0]).toMatchObject({
      action: "project.approved",
      entityId: "p1",
    });
  });

  it("refuses to reject without a reason, before touching the database", async () => {
    const outcome = await decideProject(actor, "p1", "REJECT", "  ");

    expect(outcome).toMatchObject({ ok: false, status: 400 });
    expect(findUnique).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("rejects with a reason and records it", async () => {
    findUnique.mockResolvedValue({
      id: "p1",
      name: "Hack the planet",
      status: "PROPOSED",
      ownerId: "m2",
    });

    const outcome = await decideProject(
      actor,
      "p1",
      "REJECT",
      "Out of scope this cycle",
    );

    expect(outcome).toMatchObject({ ok: true, status: "REJECTED" });
    expect(recordAuditEvent.mock.calls[0][0]).toMatchObject({
      action: "project.rejected",
      reason: "Out of scope this cycle",
    });
  });

  it("conflicts instead of applying twice to an already-approved proposal", async () => {
    findUnique.mockResolvedValue({
      id: "p1",
      name: "Hack the planet",
      status: "ACTIVE",
      ownerId: "m2",
    });

    const outcome = await decideProject(actor, "p1", "APPROVE", null);

    expect(outcome).toMatchObject({ ok: false, status: 409 });
    expect(outcome).toHaveProperty(
      "error",
      "This proposal has already been approved",
    );
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("conflicts when a concurrent decision won the race", async () => {
    findUnique.mockResolvedValue({
      id: "p1",
      name: "Hack the planet",
      status: "PROPOSED",
      ownerId: "m2",
    });
    // The read saw PROPOSED, but the guarded write matched no rows: someone
    // else decided it in between. This is the double-click case too.
    updateMany.mockResolvedValue({ count: 0 });

    const outcome = await decideProject(actor, "p1", "APPROVE", null);

    expect(outcome).toMatchObject({ ok: false, status: 409 });
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("will not decide a COMPLETED project", async () => {
    findUnique.mockResolvedValue({
      id: "p1",
      name: "Shipped thing",
      status: "COMPLETED",
      ownerId: "m2",
    });

    const outcome = await decideProject(actor, "p1", "APPROVE", null);
    expect(outcome).toMatchObject({ ok: false, status: 409 });
  });

  it("404s an unknown or invisible project", async () => {
    findUnique.mockResolvedValue(null);
    const outcome = await decideProject(actor, "nope", "APPROVE", null);
    expect(outcome).toMatchObject({ ok: false, status: 404 });
  });
});
