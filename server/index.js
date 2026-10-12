// editor api that lists pages and turns canvas changes into source edits
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import cors from "cors";
import { createTwoFilesPatch } from "diff";
import { applyToHtml, listHtmlIds, parseHtml } from "./lib/htmlEdit.js";
import { prepareHtmlUpload, UploadError } from "./lib/htmlUpload.js";
import {
  listPages, getPage, historyDir, slugify, uniqueSlug,
  createUploadedPage, deleteUploadedPage, publicPage,
} from "./lib/pages.js";

const PORT = Number(process.env.PORT) || 4000;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const app = express();
app.use(cors());
app.use(express.json({ limit: "12mb" })); // uploads come in as base64

async function pageFrom(req, res) {
  const id = req.query.page || req.body?.page;
  const page = await getPage(id);
  if (!page) res.status(404).json({ ok: false, error: `No page called "${id}"` });
  return page;
}

const read = (page) => fs.readFile(page.abs, "utf8");

async function write(page, code) {
  const previous = await read(page);
  const dir = historyDir(page);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${Date.now()}${path.extname(page.abs)}`), previous);
  await fs.writeFile(page.abs, code);
}

function makeDiff(page, before, after) {
  return createTwoFilesPatch(page.file, page.file, before, after, "before", "after", { context: 2 });
}

// refuse output that doesn't parse or lost an editable element
function validate(original, updated) {
  try {
    parseHtml(updated);
  } catch (e) {
    return `updated code does not parse: ${e.message}`;
  }
  const after = new Set(listHtmlIds(updated));
  const missing = listHtmlIds(original).filter((id) => !after.has(id));
  if (missing.length) return `updated code lost data-edit-id(s): ${missing.join(", ")}`;
  return null;
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/pages", async (_req, res) => {
  res.json((await listPages()).map(publicPage));
});

app.get("/api/source", async (req, res) => {
  const page = await pageFrom(req, res);
  if (!page) return;
  const code = await read(page);
  res.json({ file: page.file, code, editIds: listHtmlIds(code) });
});

// each file has a name and content plus utf8 or base64 encoding
app.post("/api/upload", async (req, res) => {
  const files = req.body?.files;
  const bytes = (files || []).reduce((n, f) => n + (f.content?.length || 0), 0);
  if (bytes > MAX_UPLOAD_BYTES) return res.status(400).json({ ok: false, error: "The upload is larger than 8 MB." });

  let prepared;
  try {
    prepared = prepareHtmlUpload(files);
  } catch (e) {
    if (e instanceof UploadError) return res.status(400).json({ ok: false, error: e.message });
    throw e;
  }

  const htmlName = files.find((f) => /\.html?$/i.test(f.name)).name;
  const slug = await uniqueSlug(slugify(/^index\.html?$/i.test(htmlName) ? "uploaded-page" : htmlName));
  const page = await createUploadedPage(slug, {
    name: htmlName.replace(/\.html?$/i, ""),
    sourceName: htmlName,
    htmlFile: prepared.htmlFile,
    html: prepared.html,
    assets: prepared.assets,
  });
  console.log(`[upload] ${htmlName} + ${prepared.assets.length} file(s) -> ${page.file} (${prepared.added} ids added)`);
  res.json({
    ok: true,
    page: publicPage(page),
    added: prepared.added,
    total: prepared.total,
    assets: prepared.assets.map((a) => a.rel),
    warnings: prepared.warnings,
  });
});

app.delete("/api/pages/:id", async (req, res) => {
  const page = await getPage(req.params.id);
  if (!page) return res.status(404).json({ ok: false, error: "Page not found" });
  try {
    await deleteUploadedPage(page);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post("/api/apply", async (req, res) => {
  const page = await pageFrom(req, res);
  if (!page) return;
  const { changes = [] } = req.body || {};
  if (!Array.isArray(changes) || changes.length === 0) {
    return res.status(400).json({ ok: false, error: "No changes to apply" });
  }

  const original = await read(page);
  let result;
  try {
    result = applyToHtml(original, changes);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
  const problem = validate(original, result.code);
  if (problem) return res.status(500).json({ ok: false, error: problem });

  if (result.code === original) {
    return res.json({ ok: true, changed: false, notes: result.notes, diff: "", code: original });
  }

  await write(page, result.code);
  console.log(`[apply] ${page.file}: ${changes.length} element change(s) written`);
  res.json({ ok: true, changed: true, notes: result.notes, diff: makeDiff(page, original, result.code), code: result.code });
});

app.post("/api/undo", async (req, res) => {
  const page = await pageFrom(req, res);
  if (!page) return;
  const dir = historyDir(page);
  const files = (await fs.readdir(dir).catch(() => [])).sort();
  const last = files.at(-1);
  if (!last) return res.status(400).json({ ok: false, error: "Nothing to undo for this page." });
  const current = await read(page);
  const previous = await fs.readFile(path.join(dir, last), "utf8");
  await fs.writeFile(page.abs, previous);
  await fs.unlink(path.join(dir, last));
  res.json({ ok: true, diff: makeDiff(page, current, previous), code: previous });
});

app.post("/api/reset", async (req, res) => {
  const page = await pageFrom(req, res);
  if (!page) return;
  const original = await fs.readFile(page.original, "utf8");
  const current = await read(page);
  if (current !== original) await write(page, original);
  res.json({ ok: true, diff: makeDiff(page, current, original), code: original });
});

app.listen(PORT, () => {
  console.log(`Editor API on http://localhost:${PORT}`);
});
