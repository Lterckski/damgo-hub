import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import React from "react";
import { renderToString } from "react-dom/server";
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
  plugins: [
    {
      name: "hydration-trace-fixtures",
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          try {
            const route = request.url?.split("?")[0];
            if (route !== "/hydrate/dashboard" && route !== "/hydrate/admin") {
              next();
              return;
            }

            const modulePath =
              route === "/hydrate/dashboard"
                ? "/dashboard-hydration-fixture.tsx"
                : "/admin-hydration-fixture.tsx";
            const exportName =
              route === "/hydrate/dashboard"
                ? "DashboardHydrationFixture"
                : "AdminHydrationFixture";
            const fixture = await server.ssrLoadModule(modulePath);
            const markup = renderToString(
              React.createElement(fixture[exportName]),
            );
            const template = await readFile(local("index.html"), "utf8");
            const html = template.replace(
              '<div id="root"></div>',
              `<div id="root" data-hydration-route="${route.endsWith("dashboard") ? "dashboard" : "admin"}">${markup}</div>`,
            );
            response.statusCode = 200;
            response.setHeader("Content-Type", "text/html; charset=utf-8");
            response.end(await server.transformIndexHtml(route, html));
          } catch (error) {
            next(error);
          }
        });
      },
    },
  ],
});
