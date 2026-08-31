import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  // A `prisma+postgres://` URL points at Prisma Postgres / Accelerate —
  // Prisma 7 requires that URL passed explicitly as `accelerateUrl`.
  if (databaseUrl.startsWith("prisma+postgres://")) {
    return new PrismaClient({ accelerateUrl: databaseUrl });
  }

  // Any other Postgres URL connects through the direct node-postgres adapter.
  //
  // max: 1 (localhost only) — the local dev database behind a localhost
  // URL (`prisma dev`'s `template1`) is PGlite, a WASM-embedded Postgres,
  // not a real server (confirmed directly: `SELECT version()` reports
  // "wasm32-unknown-linux-gnu ... emcc"). PGlite doesn't handle genuinely
  // concurrent connections — a query with 2+ relation includes makes the
  // pg driver adapter open multiple pool connections and run their
  // sub-queries in parallel, and PGlite closes one mid-query
  // (`DriverAdapterError: ConnectionClosed`, reproduced directly: any
  // single-relation include worked, every 2+-relation combination failed
  // the same way). Capping the pool at one connection forces node-postgres
  // to queue everything sequentially instead, which PGlite handles fine.
  // Scoped to localhost, not NODE_ENV — a real Postgres server (production,
  // or any non-PGlite instance) has no such limit and shouldn't be capped
  // to one connection.
  const isLocalPglite = /^postgresql:\/\/[^@]*@(localhost|127\.0\.0\.1)[:/]/.test(databaseUrl);
  const adapter = new PrismaPg({ connectionString: databaseUrl, ...(isLocalPglite ? { max: 1 } : {}) });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
