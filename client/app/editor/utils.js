
// react leaves these unitless
const UNITLESS = new Set(["fontWeight", "opacity", "lineHeight", "zIndex", "flex", "flexGrow", "flexShrink", "order"]);

export const PX_PROPS = new Set(["left", "top", "width", "height", "fontSize", "borderRadius", "gap"]);

export function cssValue(key, value) {
  if (value === null || value === undefined || value === "") return "";
  return typeof value === "number" && !UNITLESS.has(key) ? `${value}px` : String(value);
}

export function applyStyle(el, style) {
  for (const [key, value] of Object.entries(style)) el.style[key] = cssValue(key, value);
}

// "40px" -> 40
export function normalizeValue(key, raw) {
  if (raw === "" || raw === null || raw === undefined) return "";
  if (typeof raw === "number") return raw;
  const s = String(raw).trim();
  if ((PX_PROPS.has(key) || UNITLESS.has(key)) && /^-?\d+(\.\d+)?(px)?$/.test(s)) return parseFloat(s);
  if (/^-?\d+(\.\d+)?px$/.test(s)) return parseFloat(s);
  return s;
}

export function px(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export function rgbToHex(color) {
  if (!color) return "#000000";
  if (color.startsWith("#")) return color.length === 4 ? "#" + [...color.slice(1)].map((c) => c + c).join("") : color.slice(0, 7);
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return "#000000";
  return "#" + m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, "0")).join("");
}

export function isTextOnly(el) {
  return el.children.length === 0 && el.tagName !== "IMG";
}

export function editIdOf(el) {
  return el?.closest?.("[data-edit-id]") || null;
}

export function describeChange(change, before = {}) {
  const out = [];
  const s = change.style || {};
  const b = before.style || {};
  if ("left" in s || "top" in s) {
    const dx = px(s.left ?? b.left) - px(b.left);
    const dy = px(s.top ?? b.top) - px(b.top);
    const parts = [];
    if (dx) parts.push(`${Math.abs(dx)}px ${dx > 0 ? "right" : "left"}`);
    if (dy) parts.push(`${Math.abs(dy)}px ${dy > 0 ? "down" : "up"}`);
    if (parts.length) out.push(`moved ${parts.join(" and ")}`);
  }
  if ("width" in s || "height" in s) {
    out.push(`resized to ${s.width ?? "auto"}x${s.height ?? "auto"}${b.width || b.height ? ` (was ${b.width || "auto"}x${b.height || "auto"})` : ""}`);
  }
  for (const [k, v] of Object.entries(s)) {
    if (["left", "top", "width", "height", "position"].includes(k)) continue;
    out.push(`${k}: ${b[k] || "unset"} -> ${v === "" ? "unset" : v}`);
  }
  if (typeof change.text === "string") out.push(`text -> "${change.text}"`);
  for (const [k, v] of Object.entries(change.attrs || {})) out.push(`${k} -> "${v}"`);
  if (change.childOrder) out.push(`children reordered (${change.childOrder.join(", ")})`);
  return out;
}
