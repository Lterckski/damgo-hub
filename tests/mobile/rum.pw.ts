import { expect, test } from "@playwright/test";
import { parseRumBatch } from "../../lib/rum/validate";
import type { RumSample } from "../../lib/rum/shared";
test("RUM reports INP attribution and every slow interaction, including a later faster one", async ({
  page,
}) => {
  const received: RumSample[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/rum", async (route) => {
    const samples = parseRumBatch(route.request().postDataJSON());
    expect(samples).not.toBeNull();
    received.push(...(samples ?? []));
    await route.fulfill({ status: 204 });
  });
  await page.goto("/?rum");
  await page.getByRole("button", { name: "First slow interaction" }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Second slow interaction" }).click();
  await page.waitForTimeout(500);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pagehide")),
  );
  await expect
    .poll(() => received.filter((s) => s.kind === "interaction").length)
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(
      () =>
        received.filter((s) => s.kind === "vital" && s.name === "INP").length,
    )
    .toBeGreaterThan(0);
  expect(errors).toEqual([]);
  for (const sample of received.filter((s) => s.name === "INP")) {
    expect(sample.target).toContain("button");
    expect(sample.eventType).toMatch(/click|pointer|mouse/);
    expect(sample.processingDuration).toBeGreaterThan(200);
    expect(
      sample.inputDelay! +
        sample.processingDuration! +
        sample.presentationDelay!,
    ).toBeGreaterThanOrEqual(200);
    expect(JSON.stringify(sample)).not.toContain("slow interaction");
  }
});
