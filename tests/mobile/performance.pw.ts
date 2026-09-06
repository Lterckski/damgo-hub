import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("large admin table interaction workload", async ({
  page,
  context,
}, testInfo) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  const durations: number[] = [];
  for (let run = 0; run < 3; run++) {
    await page.goto("/?performance");
    await page.getByRole("button", { name: "Toggle records tab" }).waitFor();
    await page.evaluate(() => {
      const samples: number[] = [];
      Object.assign(window, { interactionSamples: samples });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (
            (entry as PerformanceEntry & { interactionId?: number })
              .interactionId
          )
            samples.push(entry.duration);
        }
      }).observe({
        type: "event",
        durationThreshold: 16,
      } as PerformanceObserverInit & { durationThreshold: number });
    });
    await page.getByRole("button", { name: "Toggle records tab" }).click();
    await expect(page.getByRole("row")).toHaveCount(51);
    // Event Timing is delivered after presentation, not synchronously at click.
    await page.waitForTimeout(300);
    durations.push(
      await page.evaluate(() =>
        Math.max(
          0,
          ...(window as unknown as { interactionSamples: number[] })
            .interactionSamples,
        ),
      ),
    );
  }
  const summary = { durationsMs: durations, cpuSlowdown: 6, records: 1000 };
  console.log(`BENCHMARK_RESULT ${JSON.stringify(summary)}`);
  await testInfo.attach("synthetic-interaction-timing", {
    body: JSON.stringify(summary),
    contentType: "application/json",
  });
  // Structural assertions are stable across CI machines; timings are evidence,
  // not a flaky hard latency threshold or a field INP claim.
  // With no selection, export covers all 1,000 matching records, not the
  // current 50-row render window.
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloaded;
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv.split("\n")).toHaveLength(1001);
  expect(csv).toContain("Record 0999");

  // Selection also spans the full filtered dataset and survives paging.
  await page
    .getByRole("checkbox", { name: "Select all matching rows" })
    .check();
  await expect(page.getByText("1000 selected")).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("Record 0050", { exact: true })).toBeVisible();

  // Search filters the source dataset before pagination. A current-page-only
  // filter from page two would find zero of these first ten records.
  await page
    .getByRole("textbox", { name: "Filter records" })
    .fill("Record 000");
  await expect(page.getByRole("row")).toHaveCount(11);
  await expect(page.getByText("10 selected", { exact: true })).toBeVisible();

  // Sorting also precedes pagination: descending order must bring the final
  // dataset record onto page one rather than only reversing its first page.
  await page.getByRole("textbox", { name: "Filter records" }).fill("");
  await page.getByRole("button", { name: "Name" }).click();
  await page.getByRole("button", { name: "Name" }).click();
  await expect(page.getByText("Record 0999", { exact: true })).toBeVisible();
});
