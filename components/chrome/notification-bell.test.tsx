import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { NotificationBell } from "./notification-bell";

const { push, get, post } = vi.hoisted(() => ({
  push: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./hub-client", () => ({ hubGet: get, hubPost: post }));

function notice(id: string, read = false) {
  return {
    id,
    action: "task.assigned",
    title: `Notice ${id}`,
    body: "Something happened",
    url: `/records/task:${id}`,
    createdAt: new Date().toISOString(),
    read,
    actor: null,
    recordId: `task:${id}`,
    inline: null,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openBell(payload: {
  unread: number;
  items: ReturnType<typeof notice>[];
}) {
  get.mockResolvedValue(payload);
  render(<NotificationBell />);
  const trigger = await screen.findByRole("button", {
    name: /notifications/i,
  });
  fireEvent.click(trigger);
  return trigger;
}

describe("notification bell read state", () => {
  it("clears the row's unread state and drops the badge when a notice is opened", async () => {
    // A never-resolving read keeps the optimistic state observable: if the
    // badge only moved because of a refetch, this test would not see it.
    post.mockReturnValue(new Promise(() => {}));
    await openBell({ unread: 2, items: [notice("a"), notice("b")] });

    expect(await screen.findByText("2")).toBeTruthy();

    fireEvent.click(await screen.findByText("Notice a"));

    await waitFor(() => expect(screen.getByText("1")).toBeTruthy());
    expect(post).toHaveBeenCalledWith({ action: "read", id: "a" });
  });

  it("removes the badge entirely once the last unread is opened", async () => {
    post.mockReturnValue(new Promise(() => {}));
    await openBell({ unread: 1, items: [notice("a"), notice("b", true)] });

    fireEvent.click(await screen.findByText("Notice a"));

    // No badge at all, rather than a "0".
    await waitFor(() => expect(screen.queryByText("0")).toBeNull());
    expect(
      screen.getByText(/0 unread notifications/i, { selector: "span" }),
    ).toBeTruthy();
  });

  it("does not double-decrement when an already-read notice is reopened", async () => {
    post.mockReturnValue(new Promise(() => {}));
    await openBell({ unread: 1, items: [notice("a", true), notice("b")] });

    fireEvent.click(await screen.findByText("Notice a"));

    // Opening a read notice leaves the count where it was.
    await waitFor(() => expect(screen.getByText("1")).toBeTruthy());
  });

  it("clears every visible row on Mark all read", async () => {
    post.mockReturnValue(new Promise(() => {}));
    await openBell({ unread: 2, items: [notice("a"), notice("b")] });

    fireEvent.click(await screen.findByText(/mark all read/i));

    await waitFor(() =>
      expect(
        screen.getByText(/0 unread notifications/i, { selector: "span" }),
      ).toBeTruthy(),
    );
  });
});
