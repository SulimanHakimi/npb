// the nextjs sample page plus uploaded html pages
// uploads live in client/public/uploads/<slug>/ so their relative links keep working
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..", "..");
const PUBLIC_UPLOADS = path.join(ROOT, "client", "public", "uploads");
const DATA_DIR = path.join(ROOT, "server", ".pages"); // originals meta and history

const SAMPLE = {
  id: "landing",
  kind: "jsx",
  name: "Landing page (Next.js sample)",
  route: "/preview",
  file: "client/app/preview/page.js",
  abs: path.join(ROOT, "client", "app", "preview", "page.js"),
  original: path.join(ROOT, "server", "templates", "preview-page.original.js"),
  uploaded: false,
};

function uploadedPage(slug, meta) {
  return {
    id: slug,
    kind: "html",
    name: meta.name || slug,
    route: `/uploads/${slug}/${meta.htmlFile}`,
    file: `client/public/uploads/${slug}/${meta.htmlFile}`,
    abs: path.join(PUBLIC_UPLOADS, slug, meta.htmlFile),
    original: path.join(DATA_DIR, slug, "original.html"),
    uploaded: true,
    sourceName: meta.sourceName,
    assets: meta.assets || [],
    uploadedAt: meta.uploadedAt,
  };
}

const readMeta = (slug) => fs.readFile(path.join(DATA_DIR, slug, "meta.json"), "utf8").then(JSON.parse).catch(() => null);

export async function listPages() {
  const pages = [SAMPLE];
  const slugs = await fs.readdir(DATA_DIR).catch(() => []);
  for (const slug of slugs.sort()) {
    const meta = await readMeta(slug);
    if (meta?.kind === "html") pages.push(uploadedPage(slug, meta));
  }
  return pages;
}

export async function getPage(id) {
  return (await listPages()).find((p) => p.id === (id || SAMPLE.id)) || null;
}

export const historyDir = (page) => path.join(DATA_DIR, page.id, "history");

export function slugify(text) {
  return String(text).toLowerCase().replace(/\.html?$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "page";
}

export async function uniqueSlug(base) {
  const taken = new Set([
    SAMPLE.id,
    ...(await fs.readdir(DATA_DIR).catch(() => [])),
    ...(await fs.readdir(PUBLIC_UPLOADS).catch(() => [])),
  ]);
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

// no absolute paths and no going up a folder
export function safeRelative(p) {
  const clean = path.posix.normalize(String(p).replace(/\\/g, "/").split(/[?#]/)[0]).replace(/^\.\//, "");
  if (!clean || clean.startsWith("../") || clean === ".." || path.posix.isAbsolute(clean)) return null;
  return clean;
}

// each asset has a relative path and a data buffer
export async function createUploadedPage(slug, { name, sourceName, htmlFile, html, assets }) {
  const dir = path.join(PUBLIC_UPLOADS, slug);
  await fs.mkdir(dir, { recursive: true });
  for (const a of assets) {
    const target = path.join(dir, a.rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, a.data);
  }
  await fs.writeFile(path.join(dir, htmlFile), html);

  const meta = { kind: "html", name, sourceName, htmlFile, assets: assets.map((a) => a.rel), uploadedAt: new Date().toISOString() };
  await fs.mkdir(path.join(DATA_DIR, slug), { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, slug, "original.html"), html);
  await fs.writeFile(path.join(DATA_DIR, slug, "meta.json"), JSON.stringify(meta, null, 2));
  return uploadedPage(slug, meta);
}

export async function deleteUploadedPage(page) {
  if (!page.uploaded) throw new Error("The sample page can't be removed");
  await fs.rm(path.join(PUBLIC_UPLOADS, page.id), { recursive: true, force: true });
  await fs.rm(path.join(DATA_DIR, page.id), { recursive: true, force: true });
}

// don't send disk paths to the browser
export const publicPage = ({ abs, original, ...rest }) => rest;
