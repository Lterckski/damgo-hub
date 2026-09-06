import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";

const projectRoot = process.cwd();
const nextDir = path.join(projectRoot, ".next");
const appPathsFile = path.join(nextDir, "server/app-paths-manifest.json");

if (!fs.existsSync(appPathsFile)) {
  throw new Error("No production build found. Run `npm run build` first.");
}

function publicRoute(appPath) {
  return appPath.replace(/\/\([^/]+\)/g, "").replace(/\/page$/, "") || "/";
}

function readClientManifest(manifestPath, appPath) {
  const context = { globalThis: {} };
  vm.runInNewContext(fs.readFileSync(manifestPath, "utf8"), context);
  return context.globalThis.__RSC_MANIFEST?.[appPath];
}

const appPaths = JSON.parse(fs.readFileSync(appPathsFile, "utf8"));
const rows = [];

for (const [appPath, serverFile] of Object.entries(appPaths)) {
  if (!appPath.endsWith("/page") || appPath === "/_global-error/page") continue;

  const clientManifestPath = path.join(
    nextDir,
    "server",
    serverFile.replace(/\.js$/, "_client-reference-manifest.js"),
  );
  if (!fs.existsSync(clientManifestPath)) continue;

  const clientManifest = readClientManifest(clientManifestPath, appPath);
  if (!clientManifest) continue;

  const buildManifestPath = path.join(
    nextDir,
    "server",
    serverFile.replace(/\.js$/, "/build-manifest.json"),
  );
  const buildManifest = JSON.parse(fs.readFileSync(buildManifestPath, "utf8"));
  const files = new Set(
    [...buildManifest.rootMainFiles, ...buildManifest.polyfillFiles].map(
      (file) => `static/${file.replace(/^static\//, "")}`,
    ),
  );

  for (const clientModule of Object.values(clientManifest.clientModules)) {
    for (const chunk of clientModule.chunks ?? []) {
      files.add(chunk.replace(/^\/_next\//, ""));
    }
  }

  const chunks = [];
  for (const file of files) {
    const absolutePath = path.join(nextDir, file);
    if (!fs.existsSync(absolutePath)) continue;
    const contents = fs.readFileSync(absolutePath);
    chunks.push({
      file: file.replace("static/chunks/", ""),
      rawBytes: contents.length,
      gzipBytes: zlib.gzipSync(contents).length,
    });
  }

  rows.push({
    route: publicRoute(appPath),
    rawBytes: chunks.reduce((total, chunk) => total + chunk.rawBytes, 0),
    gzipBytes: chunks.reduce((total, chunk) => total + chunk.gzipBytes, 0),
    chunkCount: chunks.length,
    largestChunks: chunks
      .sort((left, right) => right.gzipBytes - left.gzipBytes)
      .slice(0, 5),
  });
}

rows.sort((left, right) => right.gzipBytes - left.gzipBytes);

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
} else {
  console.log("| Route | Raw KiB | Gzip KiB | Chunks |");
  console.log("|---|---:|---:|---:|");
  for (const row of rows) {
    console.log(
      `| \`${row.route}\` | ${(row.rawBytes / 1024).toFixed(1)} | ${(row.gzipBytes / 1024).toFixed(1)} | ${row.chunkCount} |`,
    );
  }
}
