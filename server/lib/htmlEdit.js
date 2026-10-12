// finds elements by data-edit-id using parse5 source locations and edits the html in place
import { parse } from "parse5";

const PARSE_OPTS = { sourceCodeLocationInfo: true };

// nothing visible to select
const NO_ID = new Set(["html", "head", "body", "script", "style", "link", "meta", "title", "base", "br", "wbr", "template", "noscript"]);
const UNITLESS = new Set(["font-weight", "opacity", "line-height", "z-index", "flex", "flex-grow", "flex-shrink", "order"]);

function walk(node, visit) {
  visit(node);
  for (const c of node.childNodes || []) walk(c, visit);
  if (node.content) walk(node.content, visit);
}

const isElement = (n) => Boolean(n.tagName);
const attrOf = (n, name) => n.attrs?.find((a) => a.name === name)?.value ?? null;
const splice = (s, start, end, text) => s.slice(0, start) + text + s.slice(end);
const escText = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const kebab = (k) => (k.startsWith("--") ? k : k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()));

export function parseHtml(source) {
  return parse(source, PARSE_OPTS);
}

export function indexHtml(source) {
  const map = new Map();
  walk(parseHtml(source), (n) => {
    const id = isElement(n) && attrOf(n, "data-edit-id");
    if (id && !map.has(id)) map.set(id, n);
  });
  return map;
}

export const listHtmlIds = (source) => [...indexHtml(source).keys()];

function find(source, id) {
  const el = indexHtml(source).get(id);
  if (!el?.sourceCodeLocation?.startTag) throw new Error(`data-edit-id="${id}" not found in the HTML`);
  return el;
}

// right before > or />
function startTagInsertAt(source, el) {
  const end = el.sourceCodeLocation.startTag.endOffset;
  return source[end - 2] === "/" ? end - 2 : end - 1;
}

// h1-1 button-2 and so on for every element in <body>
export function injectHtmlIds(source) {
  const doc = parseHtml(source);
  const used = new Set();
  walk(doc, (n) => { const id = isElement(n) && attrOf(n, "data-edit-id"); if (id) used.add(id); });
  const counters = {};
  const spots = [];
  let inBody = false;
  walk(doc, (n) => {
    if (n.tagName === "body") inBody = true;
    if (!inBody || !isElement(n) || NO_ID.has(n.tagName) || attrOf(n, "data-edit-id")) return;
    const loc = n.sourceCodeLocation?.startTag;
    if (!loc) return; // parser-made element like <tbody> that isn't in the file
    let id;
    do {
      counters[n.tagName] = (counters[n.tagName] || 0) + 1;
      id = `${n.tagName}-${counters[n.tagName]}`;
    } while (used.has(id));
    used.add(id);
    spots.push({ at: loc.startOffset + 1 + n.tagName.length, id });
  });
  let out = source;
  for (const s of spots.sort((a, b) => b.at - a.at)) out = splice(out, s.at, s.at, ` data-edit-id="${s.id}"`);
  return { code: out, added: spots.length };
}

// splits on semicolons but not inside quotes or url()
function parseDecls(text) {
  const out = [];
  let buf = "";
  let quote = null;
  let depth = 0;
  const flush = () => {
    const i = buf.indexOf(":");
    if (i > 0) {
      const prop = buf.slice(0, i).trim();
      const value = buf.slice(i + 1).trim();
      if (prop && value) out.push([prop.startsWith("--") ? prop : prop.toLowerCase(), value]);
    }
    buf = "";
  };
  for (const ch of text || "") {
    if (quote) { if (ch === quote) quote = null; buf += ch; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === ";" && depth === 0) { flush(); continue; }
    buf += ch;
  }
  flush();
  return out;
}

function cssValue(prop, value) {
  return typeof value === "number" && !UNITLESS.has(prop) ? `${value}px` : String(value);
}

// keys come in camelCase from the canvas
export function setStyle(source, id, style) {
  const el = find(source, id);
  const decls = parseDecls(attrOf(el, "style"));
  for (const [key, value] of Object.entries(style)) {
    const prop = kebab(key);
    const i = decls.findIndex(([p]) => p === prop);
    if (value === null || value === "") { if (i >= 0) decls.splice(i, 1); continue; }
    if (i >= 0) decls[i][1] = cssValue(prop, value);
    else decls.push([prop, cssValue(prop, value)]);
  }
  const text = decls.map(([p, v]) => `${p}: ${v}`).join("; ");
  const loc = el.sourceCodeLocation.attrs?.style;
  if (loc) return splice(source, loc.startOffset, loc.endOffset, text ? `style="${escAttr(text)}"` : "");
  if (!text) return source;
  const at = startTagInsertAt(source, el);
  return splice(source, at, at, ` style="${escAttr(text)}"`);
}

export function setAttribute(source, id, name, value) {
  const el = find(source, id);
  const loc = el.sourceCodeLocation.attrs?.[name];
  const text = `${name}="${escAttr(value)}"`;
  if (loc) return splice(source, loc.startOffset, loc.endOffset, text);
  const at = startTagInsertAt(source, el);
  return splice(source, at, at, " " + text);
}

export function setText(source, id, text) {
  const el = find(source, id);
  const { startTag, endTag } = el.sourceCodeLocation;
  if (!endTag) throw new Error(`${id}: has no closing tag, so its text can't be replaced`);
  if (el.childNodes.some(isElement)) throw new Error(`${id}: has nested elements; text not replaced`);
  return splice(source, startTag.endOffset, endTag.startOffset, escText(text));
}

export function reorderChildren(source, id, ids) {
  const el = find(source, id);
  const kids = el.childNodes.filter((c) => isElement(c) && c.sourceCodeLocation);
  const kidIds = kids.map((k) => attrOf(k, "data-edit-id"));
  const sameSet = ids.length === kids.length && [...ids].sort().join("\u0000") === [...kidIds].sort().join("\u0000");
  if (!sameSet) throw new Error(`${id}: child list does not match the HTML (the browser may have added elements)`);
  // children without an id keep their spot
  const order = ids.filter(Boolean).map((x) => kids[kidIds.indexOf(x)]);
  let k = 0;
  const target = kids.map((kid, i) => (kidIds[i] ? order[k++] : kid));
  let out = source;
  for (let i = kids.length - 1; i >= 0; i--) {
    const from = target[i].sourceCodeLocation;
    const to = kids[i].sourceCodeLocation;
    out = splice(out, to.startOffset, to.endOffset, source.slice(from.startOffset, from.endOffset));
  }
  return out;
}

export function applyToHtml(source, changes) {
  let code = source;
  const notes = [];
  const run = (label, fn) => {
    try {
      code = fn(code);
      notes.push(label);
    } catch (e) {
      notes.push(`skipped: ${e.message}`);
    }
  };
  for (const c of changes) {
    if (c.style && Object.keys(c.style).length) {
      const desc = Object.entries(c.style).map(([k, v]) => `${kebab(k)}: ${v === "" || v === null ? "removed" : cssValue(kebab(k), v)}`).join("; ");
      run(`${c.id}: style -> ${desc}`, (s) => setStyle(s, c.id, c.style));
    }
    for (const [name, value] of Object.entries(c.attrs || {})) {
      run(`${c.id}: ${name}="${value}"`, (s) => setAttribute(s, c.id, name, value));
    }
    if (typeof c.text === "string") run(`${c.id}: text -> "${c.text}"`, (s) => setText(s, c.id, c.text));
    if (Array.isArray(c.childOrder)) {
      run(`${c.id}: children reordered`, (s) => reorderChildren(s, c.id, c.childOrder));
    }
  }
  return { code, notes };
}

export function htmlRefs(source) {
  const refs = new Set();
  walk(parseHtml(source), (n) => {
    if (!isElement(n)) return;
    for (const name of ["href", "src", "poster"]) {
      const v = attrOf(n, name);
      if (v && (n.tagName !== "a" || name !== "href")) refs.add(v);
    }
    const style = attrOf(n, "style");
    if (style) cssRefs(style).forEach((r) => refs.add(r));
    if (n.tagName === "style") cssRefs(n.childNodes.map((c) => c.value || "").join("")).forEach((r) => refs.add(r));
  });
  return [...refs].filter(isRelative);
}

export function cssRefs(css) {
  const out = [];
  for (const m of css.matchAll(/url\(\s*['"]?([^'")]+?)['"]?\s*\)/g)) out.push(m[1]);
  for (const m of css.matchAll(/@import\s+['"]([^'"]+)['"]/g)) out.push(m[1]);
  return out.filter(isRelative);
}

export function isRelative(url) {
  return Boolean(url) && !/^([a-z][a-z0-9+.-]*:|\/|#|data:|\?)/i.test(url.trim());
}

export function linkStylesheets(source, hrefs) {
  if (!hrefs.length) return source;
  const tags = hrefs.map((h) => `  <link rel="stylesheet" href="${escAttr(h)}">\n`).join("");
  const doc = parseHtml(source);
  let head = null;
  walk(doc, (n) => { if (n.tagName === "head" && !head) head = n; });
  const endTag = head?.sourceCodeLocation?.endTag;
  if (endTag) return splice(source, endTag.startOffset, endTag.startOffset, tags);
  return tags + source;
}

export function hasBodyContent(source) {
  let found = false;
  let inBody = false;
  walk(parseHtml(source), (n) => {
    if (n.tagName === "body") inBody = true;
    else if (inBody && isElement(n) && !NO_ID.has(n.tagName)) found = true;
  });
  return found;
}
