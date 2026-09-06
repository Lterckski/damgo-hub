// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), store: vi.fn() }));
vi.mock("@/lib/hub/context", () => ({
  requireWorkspaceSession: mocks.session,
  HubAccessError: class HubAccessError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
}));
vi.mock("@/lib/rum/store", () => ({ storeRumBatch: mocks.store }));
import { POST } from "./route";
import { HubAccessError } from "@/lib/hub/context";
const sample = {
  kind: "vital",
  sampleId: "metric",
  pageId: "page",
  revision: 1,
  name: "CLS",
  value: 0,
  route: "/tasks",
  pageRoute: "/tasks",
  device: "desktop",
  target: null,
  eventType: null,
  inputDelay: null,
  processingDuration: null,
  presentationDelay: null,
};
const request = (body: string, origin = "https://hub.test") =>
  new Request("https://hub.test/api/rum", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body,
  });
beforeEach(() => {
  vi.stubEnv("RUM_ENABLED", "true");
  mocks.session.mockReset().mockResolvedValue({ orgId: "verified-org" });
  mocks.store.mockReset().mockResolvedValue(undefined);
});
it("requires same-origin authentication and validates streamed payload size", async () => {
  expect((await POST(request("{}", "https://elsewhere.test"))).status).toBe(
    403,
  );
  mocks.session.mockRejectedValueOnce(new HubAccessError("Sign in", 401));
  expect((await POST(request("{}"))).status).toBe(401);
  expect((await POST(request("x".repeat(30001)))).status).toBe(413);
  expect((await POST(request("{"))).status).toBe(400);
  expect(mocks.store).not.toHaveBeenCalled();
});
it("stores sanitized samples under the verified organization and client release", async () => {
  expect(
    (
      await POST(
        request(
          JSON.stringify({
            samples: [sample],
            release: "abc123",
            orgId: "forged",
          }),
        ),
      )
    ).status,
  ).toBe(204);
  expect(mocks.store).toHaveBeenCalledWith("verified-org", [sample], "abc123");
});
