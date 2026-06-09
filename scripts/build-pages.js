const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const STATIC_ITEMS = [
  "admin.html",
  "admin.js",
  "content-store.js",
  "index.html",
  "script.js",
  "site-config.js",
  "styles.css",
  "assets",
];

async function main() {
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });

  for (const item of STATIC_ITEMS) {
    await copyItem(path.join(ROOT, item), path.join(DIST, item));
  }

  const assetManifest = await collectFiles(path.join(DIST, "assets"), DIST);
  await fs.writeFile(
    path.join(DIST, "asset-manifest.json"),
    JSON.stringify({ files: assetManifest }, null, 2),
    "utf8",
  );

  console.log(`Cloudflare Pages output ready: ${DIST}`);
}

async function copyItem(sourcePath, targetPath) {
  const stats = await fs.stat(sourcePath);
  if (stats.isDirectory()) {
    await fs.cp(sourcePath, targetPath, { recursive: true });
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
}

async function collectFiles(rootPath, basePath) {
  const items = [];
  await walk(rootPath, basePath, items);
  return items.sort();
}

async function walk(currentPath, basePath, items) {
  const stats = await fs.stat(currentPath);
  if (stats.isDirectory()) {
    const children = await fs.readdir(currentPath);
    for (const child of children) {
      await walk(path.join(currentPath, child), basePath, items);
    }
    return;
  }

  items.push(path.relative(basePath, currentPath).replaceAll("\\", "/"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
