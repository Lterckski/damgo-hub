import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const local = (name: string) => fileURLToPath(new URL(name, import.meta.url));
export default defineConfig({
  root: local("."),
  define: {
    "process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA": "undefined",
    "process.env.NEXT_PUBLIC_RUM_RELEASE": JSON.stringify("fixture"),
  },
  resolve: {
    alias: {
      "@": root,
      "next/navigation": local("mocks/navigation.ts"),
      "next/link": local("mocks/link.jsx"),
      "next/image": local("mocks/image.jsx"),
      "@clerk/nextjs": local("mocks/clerk.jsx"),
    },
  },
  esbuild: { jsx: "automatic" },
  server: {
    host: "127.0.0.1",
    port: 3109,
    strictPort: true,
    fs: { allow: [root] },
  },
});
