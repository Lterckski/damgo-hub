import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { AppDock } from "./app-dock";
vi.mock("next/navigation", () => ({ usePathname: () => "/tasks" }));
afterEach(cleanup);
it("opens navigation by tap with every member destination and no admin link", async () => {
  render(<AppDock isAdmin={false} />);
  fireEvent.click(screen.getByRole("button", { name: /Navigate/ }));
  const navigation = await screen.findByRole("navigation", {
    name: "Mobile navigation",
  });
  expect(within(navigation).getAllByRole("link")).toHaveLength(10);
  expect(within(navigation).queryByRole("link", { name: "Admin" })).toBeNull();
  expect(
    within(navigation)
      .getByRole("link", { name: "Tasks" })
      .getAttribute("aria-current"),
  ).toBe("page");
  fireEvent.keyDown(navigation, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("includes the admin destination for admins", async () => {
  render(<AppDock isAdmin />);
  fireEvent.click(screen.getByRole("button", { name: /Navigate/ }));
  const navigation = await screen.findByRole("navigation", {
    name: "Mobile navigation",
  });
  expect(
    within(navigation)
      .getByRole("link", { name: "Admin" })
      .getAttribute("href"),
  ).toBe("/admin");
});
