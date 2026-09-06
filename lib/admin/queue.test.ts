import { describe, expect, it } from "vitest";

import {
  QUEUE_ACTION_IDS,
  REASON_REQUIRED_ACTION_IDS,
  isQueueActionId,
  penaltyDueAt,
} from "./queue";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("penaltyDueAt", () => {
  it("uses the explicit dueAt when the penalty has one", () => {
    const dueAt = new Date("2026-03-01T00:00:00.000Z");
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    expect(penaltyDueAt({ dueAt, createdAt }, 14)).toEqual(dueAt);
  });

  it("falls back to createdAt + penaltyDueDays when dueAt is null", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    // The fallback is what lets penalties issued before the dueAt column
    // existed still participate in "past due" without a backfill.
    expect(penaltyDueAt({ dueAt: null, createdAt }, 14).getTime()).toBe(
      createdAt.getTime() + 14 * DAY_MS,
    );
  });

  it("honours a changed org setting rather than a hardcoded window", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    expect(penaltyDueAt({ dueAt: null, createdAt }, 30).getTime()).toBe(
      createdAt.getTime() + 30 * DAY_MS,
    );
  });
});

describe("isQueueActionId", () => {
  it("accepts every action the queue actually offers", () => {
    for (const actionId of QUEUE_ACTION_IDS) {
      expect(isQueueActionId(actionId)).toBe(true);
    }
  });

  it("rejects anything not on the allowlist", () => {
    // The route dispatches on this, so a client inventing an action id
    // must not reach the mutation switch at all.
    expect(isQueueActionId("member.delete")).toBe(false);
    expect(isQueueActionId("transaction.approve; DROP")).toBe(false);
    expect(isQueueActionId(null)).toBe(false);
    expect(isQueueActionId(undefined)).toBe(false);
    expect(isQueueActionId(42)).toBe(false);
  });
});

describe("REASON_REQUIRED_ACTION_IDS", () => {
  it("covers the destructive/override actions", () => {
    expect(REASON_REQUIRED_ACTION_IDS.has("penalty.waive")).toBe(true);
    expect(REASON_REQUIRED_ACTION_IDS.has("task.extend")).toBe(true);
  });

  it("does not demand a reason for routine approvals", () => {
    expect(REASON_REQUIRED_ACTION_IDS.has("transaction.approve")).toBe(false);
    expect(REASON_REQUIRED_ACTION_IDS.has("penalty.resolve")).toBe(false);
  });
});
