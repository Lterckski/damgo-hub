import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirrors tsconfig.json's "@/*" path mapping. Needed once a module under
  // test imports another one by its "@/..." alias (lib/admin/* and
  // lib/audit-log.ts do) — Vite doesn't read tsconfig paths on its own, so
  // without this those tests fail to resolve rather than fail to pass.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    restoreMocks: true,
  },
});
