"use client";

import { useEffect, useState } from "react";
import { isTextOnly, normalizeValue, px, rgbToHex } from "./utils";

function Field({ label, value, onCommit, type = "text", placeholder, wide, unit }) {
  const [draft, setDraft] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(value ?? "");
  }, [value, focused]);

  const commit = (v = draft) => {
    if (String(v) !== String(value ?? "")) onCommit(v);
  };
  return (
    <label className={`sx-field ${wide ? "wide" : ""}`}>
      <span className="sx-field-label">{label}</span>
      <input
        type={type}
        value={draft}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); commit(); }}
        onChange={(e) => {
          setDraft(e.target.value);
          // numbers apply as you type so the steppers feel live
          if (type === "number" && e.target.value !== "" && Number.isFinite(Number(e.target.value))) commit(e.target.value);
        }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      />
      {unit && <span className="sx-unit">{unit}</span>}
    </label>
  );
}

function Pick({ label, value, options, onChange }) {
  return (
    <label className="sx-field">
      <span className="sx-field-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Swatch({ label, value, onCommit }) {
  const hex = rgbToHex(value);
  return (
    <div className="sx-field wide sx-swatch">
      <span className="sx-field-label">{label}</span>
      <input type="color" value={hex} onChange={(e) => onCommit(e.target.value)} aria-label={`${label} picker`} />
      <Field label="" value={hex} onCommit={onCommit} />
    </div>
  );
}

function Group({ title, children }) {
  return (
    <section className="sx-group">
      <h3>{title}</h3>
      <div className="sx-grid">{children}</div>
    </section>
  );
}

function lineOf(source, id) {
  if (!source || !id) return null;
  const idx = source.indexOf(`data-edit-id="${id}"`);
  return idx < 0 ? null : source.slice(0, idx).split("\n").length;
}

export default function Inspector({ el, id, file, source, pending, commit, onMoveSibling, onEditText }) {
  if (!el) {
    return (
      <div className="sx-insp-empty">
        <p>Click anything on the board to see its properties.</p>
        <p className="sx-quiet">
          Each element is tied to one line of the source file by its <code>data-edit-id</code>, so what you change here lands on that line.
        </p>
      </div>
    );
  }

  const cs = el.ownerDocument.defaultView.getComputedStyle(el);
  const inline = (k) => el.style[k];
  const set = (key) => (raw) => commit(el, { style: { [key]: normalizeValue(key, raw) } });
  const setPos = (key) => (raw) =>
    commit(el, {
      style: { ...(cs.position === "static" && { position: "relative" }), [key]: normalizeValue(key, raw) },
    });
  const rect = el.getBoundingClientRect();
  const tag = el.tagName.toLowerCase();
  const textOnly = isTextOnly(el);
  const line = lineOf(source, id);
  const parent = el.parentElement;
  const canReorder = Boolean(parent?.dataset.editId);

  return (
    <div className="sx-insp">
      <div className="sx-insp-head">
        <div className="sx-insp-title">
          <span className="sx-insp-tag">{tag}</span>
          <span className="sx-insp-id">{id}</span>
        </div>
        <div className="sx-insp-src">{file.split("/").pop()}{line ? ` line ${line}` : ""}</div>
        {pending && <div className="sx-insp-pending">Changed, not applied yet</div>}
      </div>

      <Group title="Offset">
        <Field label="X" type="number" unit="px" value={px(inline("left"))} onCommit={setPos("left")} />
        <Field label="Y" type="number" unit="px" value={px(inline("top"))} onCommit={setPos("top")} />
        {canReorder && (
          <div className="sx-order wide">
            <span>Order inside {parent.dataset.editId}</span>
            <button onClick={() => onMoveSibling(-1)} disabled={!el.previousElementSibling}>Move up</button>
            <button onClick={() => onMoveSibling(1)} disabled={!el.nextElementSibling}>Move down</button>
          </div>
        )}
      </Group>

      <Group title="Size">
        <Field label="W" value={inline("width") || Math.round(rect.width)} onCommit={set("width")} />
        <Field label="H" value={inline("height") || Math.round(rect.height)} onCommit={set("height")} />
      </Group>

      <Group title="Spacing">
        <Field label="Margin" value={inline("margin") || cs.margin} onCommit={set("margin")} wide />
        <Field label="Padding" value={inline("padding") || cs.padding} onCommit={set("padding")} wide />
        {["flex", "grid"].includes(cs.display) && <Field label="Gap" value={inline("gap") || cs.gap} onCommit={set("gap")} wide />}
      </Group>

      <Group title="Text">
        <Field label="Size" type="number" unit="px" value={px(cs.fontSize)} onCommit={set("fontSize")} />
        <Pick label="Weight" value={cs.fontWeight} options={[300, 400, 500, 600, 700, 800, 900]} onChange={(v) => commit(el, { style: { fontWeight: Number(v) } })} />
        <Pick label="Align" value={cs.textAlign === "start" ? "left" : cs.textAlign} options={["left", "center", "right"]} onChange={(v) => commit(el, { style: { textAlign: v } })} />
        <Field label="Leading" value={inline("lineHeight") || ""} placeholder={cs.lineHeight} onCommit={set("lineHeight")} />
        <Swatch label="Colour" value={cs.color} onCommit={set("color")} />
      </Group>

      <Group title="Fill">
        <Swatch label="Background" value={cs.backgroundColor === "rgba(0, 0, 0, 0)" ? "#ffffff" : cs.backgroundColor} onCommit={set("background")} />
        <Field label="Radius" type="number" unit="px" value={px(cs.borderTopLeftRadius)} onCommit={set("borderRadius")} />
        <Field label="Opacity" type="number" value={cs.opacity} onCommit={set("opacity")} />
      </Group>

      {textOnly && (
        <section className="sx-group">
          <h3>Wording</h3>
          <textarea
            className="sx-textarea"
            defaultValue={el.textContent}
            key={`${id}-${pending?.text ?? ""}`}
            onBlur={(e) => e.target.value !== el.textContent && commit(el, { text: e.target.value })}
          />
          <button className="sx-ghost sx-small" onClick={onEditText}>Type on the board instead</button>
        </section>
      )}

      {tag === "img" && (
        <Group title="Image">
          <Field label="File" value={el.getAttribute("src")} onCommit={(v) => commit(el, { attrs: { src: v } })} wide />
          <Field label="Alt text" value={el.getAttribute("alt")} onCommit={(v) => commit(el, { attrs: { alt: v } })} wide />
        </Group>
      )}
    </div>
  );
}
