// one html file plus its css images and fonts -> a page folder
import path from "node:path";
import { safeRelative } from "./pages.js";
import { injectHtmlIds, listHtmlIds, htmlRefs, cssRefs, linkStylesheets, hasBodyContent, parseHtml } from "./htmlEdit.js";

const ASSET_EXT = new Set(["css", "png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "ico", "bmp", "woff", "woff2", "ttf", "otf"]);
const ext = (name) => name.split(".").pop().toLowerCase();
const base = (p) => path.posix.basename(p).toLowerCase();

export class UploadError extends Error {}

export function prepareHtmlUpload(files) {
  if (!Array.isArray(files) || files.length === 0) throw new UploadError("Choose an .html file to upload.");

  const htmlFiles = files.filter((f) => /\.html?$/i.test(f.name));
  if (htmlFiles.length === 0) throw new UploadError("Include one .html file. CSS files and images can come along with it.");
  if (htmlFiles.length > 1) throw new UploadError(`Upload one HTML page at a time (you chose ${htmlFiles.map((f) => f.name).join(", ")}).`);

  const rejected = files.filter((f) => !/\.html?$/i.test(f.name) && !ASSET_EXT.has(ext(f.name)));
  if (rejected.length) {
    throw new UploadError(`These files can't be uploaded: ${rejected.map((f) => f.name).join(", ")}. Use one .html file plus .css files, images (png, jpg, svg, webp, gif) or fonts.`);
  }

  const htmlFile = path.posix.basename(htmlFiles[0].name).replace(/[^\w.-]+/g, "-");
  let html = decode(htmlFiles[0]).toString("utf8");
  try {
    parseHtml(html);
  } catch (e) {
    throw new UploadError(`This HTML file couldn't be read: ${e.message}`);
  }
  if (!hasBodyContent(html)) throw new UploadError("The HTML file has nothing in <body> to edit.");

  const htmlRefList = htmlRefs(html).map(safeRelative).filter(Boolean);
  const assets = [];
  const placeFor = (name, refs) => refs.find((r) => base(r) === name.toLowerCase()) || safeRelative(path.posix.basename(name));

  // css goes where the html links it
  const cssFiles = files.filter((f) => ext(f.name) === "css");
  for (const f of cssFiles) assets.push({ rel: placeFor(f.name, htmlRefList), data: decode(f), css: true });

  // images and fonts go where the html or css points and css paths are relative to the css file
  const cssRefList = assets.flatMap((a) =>
    cssRefs(a.data.toString("utf8")).map((r) => safeRelative(path.posix.join(path.posix.dirname(a.rel), r))).filter(Boolean)
  );
  const allRefs = [...htmlRefList, ...cssRefList];
  for (const f of files) {
    if (/\.html?$/i.test(f.name) || ext(f.name) === "css") continue;
    assets.push({ rel: placeFor(f.name, allRefs), data: decode(f) });
  }

  const linked = new Set(htmlRefList.map((r) => r.toLowerCase()));
  const unlinked = assets.filter((a) => a.css && !linked.has(a.rel.toLowerCase())).map((a) => a.rel);
  html = linkStylesheets(html, unlinked);

  const { code, added } = injectHtmlIds(html);

  const placed = new Set(assets.map((a) => a.rel.toLowerCase()));
  const missing = [...new Set(allRefs)].filter((r) => !placed.has(r.toLowerCase()) && r.toLowerCase() !== htmlFile.toLowerCase() && !/\.html?$/i.test(r));
  const warnings = [];
  if (unlinked.length) warnings.push(`Linked ${unlinked.join(", ")} in the page's <head>, because the HTML didn't reference ${unlinked.length === 1 ? "it" : "them"}.`);
  if (missing.length) {
    warnings.push(`The page refers to files you didn't upload, so they won't load: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ", ..." : ""}. Upload them together with the HTML to fix this.`);
  }

  return {
    htmlFile,
    html: code,
    assets: assets.map(({ rel, data }) => ({ rel, data })),
    added,
    total: listHtmlIds(code).length,
    warnings,
  };
}

function decode(f) {
  return f.encoding === "base64" ? Buffer.from(f.content || "", "base64") : Buffer.from(f.content || "", "utf8");
}
