import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SearchPalette } from "./search-palette";
const { push, get, post } = vi.hoisted(() => ({
  push: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./hub-client", () => ({ hubGet: get, hubPost: post }));
const recent = {
  id: "task:a",
  title: "Draft the demo",
  entityType: "task",
  body: "Assigned to you",
  status: "TODO",
  url: "/records/task:a",
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("search palette", () => {
  it("shows recommendations and inline quick actions on empty input", async () => {
    get.mockResolvedValue({ recents: [recent], needs: [] });
    const onCreate = vi.fn();
    render(
      <SearchPalette
        open
        onClose={vi.fn()}
        isAdmin={false}
        onCreate={onCreate}
      />,
    );
    expect(
      await screen.findByRole("option", { name: /Draft the demo/ }),
    ).toBeTruthy();
    expect(screen.getByText("Recent")).toBeTruthy();
    expect(screen.getByText("Needs you")).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Admin" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "New task" }));
    expect(onCreate).toHaveBeenCalledWith("task");
  });
  it("opens the keyboard-selected record and closes the palette", async () => {
    get.mockResolvedValue({ recents: [recent], needs: [] });
    const close = vi.fn();
    render(<SearchPalette open onClose={close} isAdmin onCreate={vi.fn()} />);
    await screen.findByRole("option", { name: /Draft the demo/ });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(push).toHaveBeenCalledWith(recent.url);
    expect(close).toHaveBeenCalled();
  });
  it("queries the server after typing and renders safe highlighted text", async () => {
    get.mockImplementation((params: string) =>
      Promise.resolve(
        params.endsWith("q=demo")
          ? { results: [recent] }
          : { recents: [], needs: [] },
      ),
    );
    render(
      <SearchPalette
        open
        onClose={vi.fn()}
        isAdmin={false}
        onCreate={vi.fn()}
      />,
    );
    await screen.findByText("Recent");
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "demo" },
    });
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "mode=search&q=demo",
        expect.any(AbortSignal),
      ),
    );
    expect(
      await screen.findByRole("option", { name: /Draft the demo/ }),
    ).toBeTruthy();
    expect(screen.getByText("demo").tagName).toBe("MARK");
  });
});
