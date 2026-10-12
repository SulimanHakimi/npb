// finds jsx elements by data-edit-id and edits them with small splices so formatting stays
import * as babelParser from "@babel/parser";

export function parse(source) {
  return babelParser.parse(source, { sourceType: "module", plugins: ["jsx"] });
}

function walk(node, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "extra") continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === "string" && walk(c, visit));
    else if (v && typeof v.type === "string") walk(v, visit);
  }
}

const attrName = (a) => a.type === "JSXAttribute" && a.name?.name;

export function getEditId(openingElement) {
  const attr = openingElement.attributes.find((a) => attrName(a) === "data-edit-id");
  return attr?.value?.type === "StringLiteral" ? attr.value.value : null;
}

export function indexElements(source) {
  const map = new Map();
  walk(parse(source).program, (n) => {
    if (n.type === "JSXElement") {
      const id = getEditId(n.openingElement);
      if (id) map.set(id, n);
    }
  });
  return map;
}

export const listEditIds = (source) => [...indexElements(source).keys()];

export function snippetFor(source, id) {
  const el = indexElements(source).get(id);
  return el ? source.slice(el.start, el.end) : null;
}

const splice = (source, start, end, text) => source.slice(0, start) + text + source.slice(end);

function literal(value) {
  return typeof value === "number" ? String(value) : JSON.stringify(String(value));
}

function keyName(prop) {
  if (prop.type !== "ObjectProperty") return null;
  if (prop.key.type === "Identifier") return prop.key.name;
  if (prop.key.type === "StringLiteral") return prop.key.value;
  return null;
}

function find(source, id) {
  const el = indexElements(source).get(id);
  if (!el) throw new Error(`data-edit-id="${id}" not found in source`);
  return el;
}

// null or "" removes a key
export function setStyle(source, id, style) {
  const opening = find(source, id).openingElement;
  const attr = opening.attributes.find((a) => attrName(a) === "style");

  if (!attr) {
    const entries = Object.entries(style).filter(([, v]) => v !== null && v !== "");
    if (!entries.length) return source;
    const text = ` style={{ ${entries.map(([k, v]) => `${k}: ${literal(v)}`).join(", ")} }}`;
    const at = opening.end - (opening.selfClosing ? 2 : 1);
    return splice(source, at, at, text);
  }

  const obj = attr.value?.expression;
  if (obj?.type !== "ObjectExpression") throw new Error(`${id}: style is not an inline object literal`);

  const remaining = { ...style };
  const parts = [];
  for (const prop of obj.properties) {
    const key = keyName(prop);
    if (key && key in remaining) {
      const v = remaining[key];
      delete remaining[key];
      if (v === null || v === "") continue;
      parts.push(`${source.slice(prop.key.start, prop.key.end)}: ${literal(v)}`);
    } else {
      parts.push(source.slice(prop.start, prop.end));
    }
  }
  for (const [k, v] of Object.entries(remaining)) {
    if (v !== null && v !== "") parts.push(`${k}: ${literal(v)}`);
  }
  return splice(source, obj.start, obj.end, `{ ${parts.join(", ")} }`);
}

export function setAttribute(source, id, name, value) {
  const opening = find(source, id).openingElement;
  const attr = opening.attributes.find((a) => attrName(a) === name);
  const text = JSON.stringify(String(value));
  if (attr?.value) return splice(source, attr.value.start, attr.value.end, text);
  if (attr) return splice(source, attr.end, attr.end, `=${text}`);
  const at = opening.end - (opening.selfClosing ? 2 : 1);
  return splice(source, at, at, ` ${name}=${text}`);
}

export function setText(source, id, text) {
  const el = find(source, id);
  if (!el.closingElement) throw new Error(`${id}: self-closing element has no text`);
  if (el.children.some((c) => c.type === "JSXElement")) throw new Error(`${id}: has nested elements; text not replaced`);
  // text that comes from a code expression is left alone
  const dynamic = el.children.some((c) => c.type === "JSXExpressionContainer" && c.expression.type !== "StringLiteral" && c.expression.type !== "JSXEmptyExpression");
  if (dynamic) throw new Error(`${id}: its text comes from code (a {...} expression), so it was left unchanged. Edit it in the source.`);
  // { } < > aren't allowed raw in jsx text
  const safe = /[{}<>]/.test(text) ? `{${JSON.stringify(text)}}` : text;
  return splice(source, el.openingElement.end, el.closingElement.start, safe);
}

export function reorderChildren(source, id, ids) {
  const el = find(source, id);
  const kids = el.children.filter((c) => c.type === "JSXElement");
  const byId = new Map(kids.map((k) => [getEditId(k.openingElement), k]));
  const missing = ids.filter((x) => !byId.has(x));
  if (missing.length || ids.length !== kids.length) {
    throw new Error(`${id}: child list does not match source (${missing.join(", ") || "count mismatch"})`);
  }
  // back to front so offsets stay valid
  let out = source;
  for (let i = kids.length - 1; i >= 0; i--) {
    const target = byId.get(ids[i]);
    out = splice(out, kids[i].start, kids[i].end, source.slice(target.start, target.end));
  }
  return out;
}
