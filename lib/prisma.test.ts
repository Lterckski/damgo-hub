import { afterEach, describe, expect, it, vi } from "vitest";

interface PrismaGlobal {
  prisma?: unknown;
}

const prismaGlobal = globalThis as PrismaGlobal;
const originalGlobalClient = prismaGlobal.prisma;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();

  if (originalGlobalClient === undefined) delete prismaGlobal.prisma;
  else prismaGlobal.prisma = originalGlobalClient;
});

describe("Prisma client initialization", () => {
  it("allows task modules to be imported without runtime database secrets", async () => {
    vi.stubEnv("DATABASE_URL", "");
    delete prismaGlobal.prisma;
    vi.resetModules();

    const imported = await import("./prisma");

    expect(imported.prisma).toBeDefined();
    expect(() => imported.prisma.member).toThrowError("DATABASE_URL is not set");
  });
});
