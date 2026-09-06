import { afterEach, expect, it, vi } from "vitest";
import { downloadCsv } from "./client";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("yields before projecting rows and between chunks, and escapes CSV cells", async () => {
  vi.useFakeTimers();
  let blob: Blob | undefined;
  const create = vi.fn((value: Blob) => {
    blob = value;
    return "blob:export";
  });
  const revoke = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  let projected = 0;
  function* rows() {
    for (let i = 0; i < 600; i++) {
      projected++;
      yield [i, 'a,"b"\r\nc', null];
    }
  }
  const pending = downloadCsv("records.csv", ["ID", "Text", "Empty"], rows());
  expect(projected).toBe(0);
  await vi.advanceTimersToNextTimerAsync();
  expect(projected).toBeGreaterThan(0);
  expect(projected).toBeLessThan(600);
  await vi.runAllTimersAsync();
  await pending;
  expect(projected).toBe(600);
  expect(click).toHaveBeenCalledOnce();
  expect(revoke).toHaveBeenCalledWith("blob:export");
  vi.useRealTimers();
  const text = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob!);
  });
  expect(text).toContain('ID,Text,Empty\n0,"a,""b""\r\nc",');
  expect(text).toContain("\n599,");
});
