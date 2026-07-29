import { copyFile, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(repoRoot, "apps/web/out");
const version = process.env.TIPPARTA_ASSET_VERSION || Date.now().toString(36);

async function listHtmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listHtmlFiles(fullPath);
      }
      return entry.isFile() && entry.name.endsWith(".html") ? [fullPath] : [];
    })
  );
  return files.flat();
}

async function listPageDataFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (!entry.isDirectory()) {
        return entry.isFile() && entry.name === "__PAGE__.txt" ? [fullPath] : [];
      }

      return listPageDataFiles(fullPath);
    })
  );
  return files.flat();
}

function addVersion(value) {
  if (!value.startsWith("/_next/static/") || value.includes("?v=")) {
    return value;
  }
  return `${value}?v=${version}`;
}

for (const file of await listHtmlFiles(outDir)) {
  const input = await readFile(file, "utf8");
  const output = input.replace(/\/_next\/static\/[^"']+\.(?:js|css)/g, addVersion);
  if (output !== input) {
    await writeFile(file, output);
  }
}

for (const source of await listPageDataFiles(outDir)) {
  const relativeDir = path.relative(outDir, path.dirname(source));
  const segments = relativeDir.split(path.sep).filter(Boolean);
  const nextSegmentIndex = segments.findIndex((segment) => segment.startsWith("__next."));

  if (nextSegmentIndex === -1) {
    continue;
  }

  const destination = path.join(
    outDir,
    ...segments.slice(0, nextSegmentIndex),
    `${segments.slice(nextSegmentIndex).join(".")}.__PAGE__.txt`
  );

  try {
    await copyFile(source, destination);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

console.log(`Cache-busted Next export assets with version ${version}.`);
