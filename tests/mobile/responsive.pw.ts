import { test, type Locator } from "@playwright/test";
import assert from "node:assert/strict";

// Real app components/styles, fixture data and Clerk/router stand-ins.
// These checks do not certify auth, external delivery or physical keyboards.
test("responsive controls remain reachable across screen sizes", async ({
  page,
}, testInfo) => {
  const { width, height } = testInfo.project.use.viewport!;
  const touch = !!testInfo.project.use.hasTouch;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/hub?**", (r) =>
    r.fulfill({
      json: { items: [], unread: 0, recents: [], needs: [], preferences: [] },
    }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Mobile layout check" }).waitFor();
  await page.addStyleTag({
    content:
      ":root{--font-geist-sans:Arial,sans-serif;--font-playfair-display:Georgia,serif}",
  });
  async function fits(label: string, locator: Locator) {
    const data = await locator.evaluate((el) => ({
      width: el.clientWidth,
      scroll: el.scrollWidth,
      rect: JSON.parse(JSON.stringify(el.getBoundingClientRect())),
    }));
    assert(
      data.scroll <= data.width + 2,
      `${width} ${label} horizontal overflow: ${JSON.stringify(data)}`,
    );
    assert(
      data.rect.left >= -1 && data.rect.right <= width + 1,
      `${width} ${label} outside width: ${JSON.stringify(data)}`,
    );
    if (label.includes("dialog"))
      assert(
        data.rect.top >= -1 && data.rect.bottom <= height + 1,
        `${width} ${label} outside height: ${JSON.stringify(data)}`,
      );
  }
  await fits("body", page.locator("body"));
  if (touch) {
    await page.getByRole("button", { name: "Navigate", exact: true }).click();
    const nav = page.getByRole("dialog", { name: "Navigate Damgo Hub" });
    await nav.waitFor();
    await fits("navigation dialog", nav);
    assert.equal(await nav.getByRole("link").count(), 11);
    await page.keyboard.press("Escape");
  } else
    assert.equal(await page.locator(".desktop-navigation").isVisible(), true);
  for (const [trigger, title] of [
    ["New Task", "New Task"],
    ["Schedule Meeting", "Schedule Meeting"],
    ["New Proposal", "New Proposal"],
  ]) {
    await page
      .getByRole("button", { name: trigger, exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await fits(title + " dialog", dialog);
    if (trigger === "New Task") {
      await dialog.getByRole("button", { name: "Start", exact: true }).click();
      const picker = page.getByRole("dialog", { name: "Start", exact: true });
      await picker.waitFor();
      await fits("date picker dialog", picker);
      await page.keyboard.press("Escape");
    }
    await page.keyboard.press("Escape");
  }
  await page
    .getByRole("button", { name: "Preferences check", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "announcement delivery channel" })
    .waitFor();
  await fits("preferences dialog", page.getByRole("dialog"));
  await page.keyboard.press("Escape");
  if (width < 768) {
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("combobox").waitFor();
    await fits("search dialog", page.getByRole("dialog"));
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: /Notifications/ })
      .first()
      .click();
    await page
      .getByRole("heading", { name: "Notifications", exact: true })
      .waitFor();
    await fits(
      "notification popover",
      page.locator('[data-slot="popover-content"]'),
    );
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "tables", exact: true }).click();
  await fits("tables page", page.locator("main"));
  for (const region of await page.getByRole("region").all()) {
    const bounds = await region.boundingBox();
    assert(
      bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1,
      "Table scroll region must stay in the viewport",
    );
  }
  await page.getByRole("button", { name: "calendar", exact: true }).click();
  await fits("calendar", page.locator("main"));
  if (width < 1024) {
    await page.getByRole("button", { name: "Month", exact: true }).click();
    await fits("month calendar", page.locator("main"));
    assert.equal(
      await page
        .getByRole("region", { name: "Selected date events" })
        .isVisible(),
      true,
    );
  }
  await page.getByRole("button", { name: "board", exact: true }).click();
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page
    .getByRole("combobox", { name: "From milestone" })
    .selectOption("first");
  await page
    .getByRole("combobox", { name: "To milestone" })
    .selectOption("second");
  await page
    .getByRole("button", { name: "Add connection", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Remove connection from Design prototype to Build prototype",
    })
    .click();
  await fits("connections dialog", page.getByRole("dialog"));
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Edit milestone: Design prototype" })
    .click();
  await fits("milestone dialog", page.getByRole("dialog"));
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", {
      name: "Edit idea: A collaborative idea",
      exact: true,
    })
    .last()
    .click();
  const idea = page.getByRole("dialog", { name: "Edit idea", exact: true });
  await idea.waitFor();
  await fits("idea dialog", idea);
  await idea
    .getByRole("textbox", { name: "Idea text" })
    .fill("Updated by touch");
  await idea.getByRole("button", { name: "Save idea" }).click();
  await page
    .getByRole("button", { name: "Edit idea: Updated by touch", exact: true })
    .last()
    .waitFor();
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    `PASS ${width}x${height} ${touch ? "touch" : "mouse"}: navigation, task/meeting/project forms, nested date picker, search/preferences/inbox, calendar, board editing and connections`,
  );
});
