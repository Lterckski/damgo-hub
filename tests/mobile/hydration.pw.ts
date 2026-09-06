import { test } from "@playwright/test";

for (const route of ["dashboard", "admin"] as const) {
  test(`${route} hydration trace`, async ({ page, context }, testInfo) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(() => {
      const entries: { startTime: number; duration: number }[] = [];
      Object.assign(window, { hydrationLongTasks: entries });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          entries.push({
            startTime: Math.round(entry.startTime * 10) / 10,
            duration: Math.round(entry.duration * 10) / 10,
          });
        }
      }).observe({ type: "longtask", buffered: true });
    });

    await cdp.send("Tracing.start", {
      categories: [
        "devtools.timeline",
        "disabled-by-default-devtools.timeline",
        "v8.execute",
      ].join(","),
      transferMode: "ReturnAsStream",
    });
    await page.goto(`/hydrate/${route}`, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => performance.getEntriesByName("damgo-hydration-end").length > 0,
    );
    await page.waitForTimeout(250);

    const tracingComplete = new Promise<{ stream?: string }>((resolve) => {
      cdp.once("Tracing.tracingComplete", resolve);
    });
    await cdp.send("Tracing.end");
    const { stream } = await tracingComplete;
    if (!stream) throw new Error("Chrome did not return a trace stream");
    let trace = "";
    for (;;) {
      const chunk = await cdp.send("IO.read", { handle: stream });
      trace += chunk.data;
      if (chunk.eof) break;
    }
    await cdp.send("IO.close", { handle: stream });

    const hydration = await page.evaluate(() => {
      const start = performance.getEntriesByName("damgo-hydration-start")[0]
        ?.startTime;
      const end = performance.getEntriesByName("damgo-hydration-end")[0]
        ?.startTime;
      const longTasks = (
        window as unknown as {
          hydrationLongTasks: { startTime: number; duration: number }[];
        }
      ).hydrationLongTasks.filter(
        (entry) =>
          start !== undefined &&
          end !== undefined &&
          entry.startTime >= start &&
          entry.startTime < end,
      );
      return {
        startTime: start,
        endTime: end,
        duration: start !== undefined && end !== undefined ? end - start : null,
        longTasks,
      };
    });
    const tracePath = testInfo.outputPath(`${route}-hydration-trace.json`);
    const summaryPath = testInfo.outputPath(`${route}-hydration-summary.json`);
    await testInfo.attach(`${route}-hydration-summary`, {
      body: JSON.stringify({ cpuSlowdown: 4, ...hydration }, null, 2),
      contentType: "application/json",
    });
    await testInfo.attach(`${route}-hydration-trace`, {
      body: Buffer.from(trace),
      contentType: "application/json",
    });
    await import("node:fs/promises").then(({ writeFile }) =>
      Promise.all([
        writeFile(tracePath, trace),
        writeFile(
          summaryPath,
          JSON.stringify({ cpuSlowdown: 4, ...hydration }, null, 2),
        ),
      ]),
    );
  });
}
