// applies canvas changes to the jsx source one splice at a time
import { setStyle, setAttribute, setText, reorderChildren } from "./jsx.js";

export function applyWithAst(source, changes) {
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
      const desc = Object.entries(c.style).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ");
      run(`${c.id}: style -> ${desc}`, (s) => setStyle(s, c.id, c.style));
    }
    for (const [name, value] of Object.entries(c.attrs || {})) {
      run(`${c.id}: ${name}="${value}"`, (s) => setAttribute(s, c.id, name, value));
    }
    if (typeof c.text === "string") {
      run(`${c.id}: text -> "${c.text}"`, (s) => setText(s, c.id, c.text));
    }
    if (Array.isArray(c.childOrder)) {
      run(`${c.id}: children reordered -> ${c.childOrder.join(", ")}`, (s) => reorderChildren(s, c.id, c.childOrder));
    }
  }

  return { code, notes };
}
