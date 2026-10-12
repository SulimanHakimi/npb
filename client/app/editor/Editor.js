"use client";

// the real page runs in an iframe with an overlay on top for select drag and resize
// edits show up live in the iframe and only get written to the file on apply

import { useCallback, useEffect, useRef, useState } from "react";
import { applyStyle, cssValue, describeChange, editIdOf, isTextOnly, px } from "./utils";
import Inspector from "./Inspector";
import CodePanel from "./CodePanel";
import Uploader from "./Uploader";

const CANVAS_WIDTH = 1280;
const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export default function Editor() {
  const [pages, setPages] = useState(null); // null until the first load
  const [health, setHealth] = useState(null);
  const [page, setPage] = useState(null);
  const [frameKey, setFrameKey] = useState(0);
  const [frameHeight, setFrameHeight] = useState(900);
  const [mode, setMode] = useState("design");
  const [zoom, setZoom] = useState(0.75);
  const [selectedId, setSelectedId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [pending, setPending] = useState({});
  const [, setTick] = useState(0);
  const [source, setSource] = useState("");
  const [lastApply, setLastApply] = useState(null);
  const [verify, setVerify] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rightTab, setRightTab] = useState("inspect");
  const [notice, setNotice] = useState(null);
  const [cursor, setCursor] = useState(null); // page px for the status bar

  const frameRef = useRef(null);
  const stageRef = useRef(null);
  const originals = useRef(new Map()); // values before the first edit
  const drag = useRef(null);
  const expectRef = useRef(null); // checked against the page after reload
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const doc = () => frameRef.current?.contentDocument || null;
  const getEl = useCallback((id) => (id ? doc()?.querySelector(`[data-edit-id="${CSS.escape(id)}"]`) : null), []);

  const loadSource = useCallback(async (id) => {
    const r = await fetch(`/api/source?page=${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await r.json();
    setSource(data.code);
  }, []);

  const loadPages = useCallback(() => {
    return fetch("/api/pages").then((r) => r.json()).then((list) => { setPages(list); return list; }).catch(() => setPages([]));
  }, []);

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => setHealth({ ok: false }));
    loadPages();
  }, [loadPages]);

  const measure = useCallback(() => {
    const d = doc();
    if (!d) return;
    setFrameHeight(Math.max(600, d.documentElement.scrollHeight));
    refresh();
  }, [refresh]);

  const verifyRealPage = useCallback(() => {
    const expected = expectRef.current;
    if (!expected) return;
    const d = doc();
    const probe = d.createElement("div");
    const failed = [];
    let checked = 0;
    for (const c of expected.changes) {
      const el = getEl(c.id);
      if (!el) { failed.push(`${c.id}: missing`); continue; }
      for (const [k, v] of Object.entries(c.style || {})) {
        probe.style[k] = cssValue(k, v);
        checked++;
        if (probe.style[k] !== el.style[k]) failed.push(`${c.id}.${k}: expected ${probe.style[k] || "unset"}, got ${el.style[k] || "unset"}`);
      }
      if (typeof c.text === "string") {
        checked++;
        if (el.textContent.trim() !== c.text.trim()) failed.push(`${c.id}: text differs`);
      }
      for (const [k, v] of Object.entries(c.attrs || {})) {
        checked++;
        if (el.getAttribute(k) !== v) failed.push(`${c.id}.${k} differs`);
      }
      if (c.childOrder) {
        checked++;
        const now = [...el.children].map((x) => x.dataset.editId).join(",");
        if (now !== c.childOrder.join(",")) failed.push(`${c.id}: child order differs`);
      }
    }
    // next may still be recompiling so try again a couple of times
    if (failed.length && expected.attempt < 3) {
      expected.attempt++;
      setTimeout(() => setFrameKey((k) => k + 1), 1000);
      return;
    }
    expectRef.current = null;
    setVerify({ checked, failed, at: new Date() });
  }, [getEl]);

  const onFrameLoad = useCallback(() => {
    const d = doc();
    if (!d) return;
    measure();
    const ro = new d.defaultView.ResizeObserver(() => measure());
    ro.observe(d.body);
    verifyRealPage();
  }, [measure, verifyRealPage]);

  useEffect(() => {
    const onResize = () => refresh();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [refresh]);

  const snapshot = useCallback((el, { styleKeys = [], text = false, attrs = [], childOrder = false }) => {
    const id = el.dataset.editId;
    const o = originals.current.get(id) || { style: {}, attrs: {} };
    for (const k of styleKeys) if (!(k in o.style)) o.style[k] = el.style[k] || "";
    if (text && !("text" in o)) o.text = el.textContent;
    for (const a of attrs) if (!(a in o.attrs)) o.attrs[a] = el.getAttribute(a);
    if (childOrder && !o.childOrder) o.childOrder = [...el.children].map((c) => c.dataset.editId);
    originals.current.set(id, o);
  }, []);

  const commit = useCallback((el, patch) => {
    const id = el.dataset.editId;
    snapshot(el, {
      styleKeys: Object.keys(patch.style || {}),
      text: typeof patch.text === "string",
      attrs: Object.keys(patch.attrs || {}),
      childOrder: Boolean(patch.childOrder),
    });
    if (patch.style) applyStyle(el, patch.style);
    for (const [k, v] of Object.entries(patch.attrs || {})) el.setAttribute(k, v);
    if (typeof patch.text === "string" && el.textContent !== patch.text) el.textContent = patch.text;

    setPending((prev) => {
      const cur = prev[id] || { id, tag: el.tagName.toLowerCase() };
      return {
        ...prev,
        [id]: {
          ...cur,
          ...(patch.style && { style: { ...cur.style, ...patch.style } }),
          ...(patch.attrs && { attrs: { ...cur.attrs, ...patch.attrs } }),
          ...(typeof patch.text === "string" && { text: patch.text }),
          ...(patch.childOrder && { childOrder: patch.childOrder }),
        },
      };
    });
    refresh();
  }, [snapshot, refresh]);

  const moveSibling = useCallback((el, refEl, after) => {
    const parent = el.parentElement;
    if (!parent?.dataset.editId || !refEl || refEl === el || refEl.parentElement !== parent) return;
    snapshot(parent, { childOrder: true });
    parent.insertBefore(el, after ? refEl.nextElementSibling : refEl);
    commit(parent, { childOrder: [...parent.children].map((c) => c.dataset.editId) });
  }, [snapshot, commit]);

  const discard = () => {
    originals.current.clear();
    setPending({});
    setSelectedId(null);
    setFrameKey((k) => k + 1);
  };

  const toLocal = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoomRef.current, y: (e.clientY - r.top) / zoomRef.current };
  };
  const hit = (e) => {
    const { x, y } = toLocal(e);
    return editIdOf(doc()?.elementFromPoint(x, y));
  };

  const startDrag = (e, el, kind) => {
    const cs = doc().defaultView.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    snapshot(el, { styleKeys: ["position", "left", "top", "width", "height", "flex"] });
    drag.current = {
      kind, el, sx: e.clientX, sy: e.clientY,
      left: px(el.style.left), top: px(el.style.top), w: rect.width, h: rect.height,
      staticPos: cs.position === "static", flexGrow: cs.flexGrow !== "0", moved: false, style: null,
    };
    const onMove = (ev) => {
      const d = drag.current;
      const z = zoomRef.current;
      const dx = Math.round((ev.clientX - d.sx) / z);
      const dy = Math.round((ev.clientY - d.sy) / z);
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      d.moved = true;
      const st = {};
      if (d.kind === "move") {
        if (d.staticPos) st.position = "relative";
        st.left = d.left + dx;
        st.top = d.top + dy;
      } else {
        const k = d.kind;
        if (k.includes("e")) st.width = Math.max(8, Math.round(d.w + dx));
        if (k.includes("s")) st.height = Math.max(8, Math.round(d.h + dy));
        if (k.includes("w")) { st.width = Math.max(8, Math.round(d.w - dx)); st.left = d.left + (Math.round(d.w) - st.width); }
        if (k.includes("n")) { st.height = Math.max(8, Math.round(d.h - dy)); st.top = d.top + (Math.round(d.h) - st.height); }
        if (("left" in st || "top" in st) && d.staticPos) st.position = "relative";
        // flex-grow items ignore width
        if ("width" in st && d.flexGrow) st.flex = "none";
      }
      d.style = st;
      applyStyle(d.el, st);
      refresh();
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const d = drag.current;
      drag.current = null;
      if (d?.moved && d.style) commit(d.el, { style: d.style });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onOverlayPointerDown = (e) => {
    if (e.button !== 0) return;
    const el = hit(e);
    if (!el) { setSelectedId(null); return; }
    setSelectedId(el.dataset.editId);
    setRightTab("inspect");
    startDrag(e, el, "move");
  };

  const onOverlayPointerMove = (e) => {
    const p = toLocal(e);
    setCursor({ x: Math.round(p.x), y: Math.round(p.y) });
    if (drag.current) return;
    const el = hit(e);
    const id = el?.dataset.editId || null;
    if (id !== hoverId) setHoverId(id);
  };

  const startTextEdit = (el) => {
    const d = doc();
    const id = el.dataset.editId;
    const before = el.textContent;
    snapshot(el, { text: true });
    setEditingId(id);
    el.contentEditable = "true";
    el.focus();
    const range = d.createRange();
    range.selectNodeContents(el);
    d.getSelection().removeAllRanges();
    d.getSelection().addRange(range);

    const finish = (cancel) => {
      el.removeEventListener("blur", onBlur);
      el.removeEventListener("keydown", onKey);
      el.removeAttribute("contenteditable");
      if (cancel) el.textContent = before;
      else if (el.textContent !== before) commit(el, { text: el.textContent });
      setEditingId(null);
      refresh();
    };
    const onBlur = () => finish(false);
    const onKey = (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); el.blur(); }
      if (ev.key === "Escape") { ev.preventDefault(); finish(true); }
    };
    el.addEventListener("blur", onBlur);
    el.addEventListener("keydown", onKey);
  };

  const onOverlayDoubleClick = (e) => {
    const el = hit(e);
    if (el && isTextOnly(el)) startTextEdit(el);
  };

  // arrows nudge and esc deselects
  useEffect(() => {
    const onKey = (e) => {
      if (mode !== "design" || editingId) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      const el = getEl(selectedId);
      if (!el) return;
      if (e.key === "Escape") return setSelectedId(null);
      const step = e.shiftKey ? 10 : 1;
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!delta) return;
      e.preventDefault();
      const cs = doc().defaultView.getComputedStyle(el);
      commit(el, {
        style: {
          ...(cs.position === "static" && { position: "relative" }),
          left: px(el.style.left) + delta[0],
          top: px(el.style.top) + delta[1],
        },
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, editingId, selectedId, getEl, commit]);

  const pendingList = Object.values(pending);

  const reloadAndVerify = (changes) => {
    expectRef.current = { changes, attempt: 0 };
    setVerify(null);
    // give the dev server a moment to see the new file
    setTimeout(() => setFrameKey((k) => k + 1), 900);
  };

  const apply = async () => {
    if (!pendingList.length) return;
    const changes = pendingList.map((c) => {
      const before = originals.current.get(c.id) || {};
      return { ...c, before, summary: describeChange(c, before) };
    });
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: page.id, changes }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setLastApply({ ...data, count: changes.length, at: new Date() });
      setSource(data.code);
      originals.current.clear();
      setPending({});
      setRightTab("code");
      reloadAndVerify(changes);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const serverAction = async (path, label) => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: page.id }),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error);
      setLastApply({ action: label, changed: true, diff: data.diff, notes: [], at: new Date() });
      setSource(data.code);
      originals.current.clear();
      setPending({});
      setRightTab("code");
      reloadAndVerify([]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const openPage = (p) => {
    originals.current.clear();
    setPending({});
    setSelectedId(null);
    setHoverId(null);
    setLastApply(null);
    setVerify(null);
    setPage(p);
    loadSource(p.id);
  };

  const closePage = () => {
    if (pendingList.length && !window.confirm(`Leave this page? ${pendingList.length} change(s) are not applied yet and will be lost.`)) return;
    originals.current.clear();
    setPending({});
    setPage(null);
    loadPages();
  };

  if (!page) {
    const removePage = async (p) => {
      if (!window.confirm(`Remove "${p.name}"? Its file and edit history will be deleted.`)) return;
      const r = await fetch(`/api/pages/${encodeURIComponent(p.id)}`, { method: "DELETE" });
      const data = await r.json().catch(() => ({}));
      if (!data.ok) setError(data.error || "Couldn't remove the page.");
      loadPages();
    };
    return (
      <div className="sx-welcome">
        <div className="sx-card">
          <span className="sx-tape sx-tape-l" aria-hidden />
          <span className="sx-tape sx-tape-r" aria-hidden />
          <div className="sx-wordmark">bitlinks<span>/studio</span></div>
          <h1>{pages?.length ? "Pick a page to edit" : "Add a page to start"}</h1>
          <p>
            Upload an HTML page with its CSS and images. It opens on the board exactly as the browser shows it.
            Move, resize and retype things there. Nothing touches the file until you apply your changes.
          </p>
          <ul className="sx-files">
            {!pages?.length && (
              <li className="sx-files-empty">
                {health?.ok === false
                  ? "Can't reach the editor server on port 4000. Run npm run dev from the project folder."
                  : pages === null
                    ? "Looking for pages..."
                    : "No pages yet. Upload one below and it will show up here."}
              </li>
            )}
            {pages?.map((p) => (
              <li key={p.id} className="sx-file-row">
                <button className="sx-file-open-btn" onClick={() => openPage(p)}>
                  <span className="sx-file-name">
                    {p.name}
                  </span>
                  <span className="sx-file-path">{p.file}</span>
                  <span className="sx-file-route">{p.route}</span>
                  <span className="sx-file-open">Open</span>
                </button>
                <button className="sx-file-remove" onClick={() => removePage(p)} aria-label={`Remove ${p.name}`}>Remove</button>
              </li>
            ))}
          </ul>
          <Uploader
            onUploaded={async (data) => {
              setNotice({
                text:
                  `Uploaded ${data.page.sourceName}` +
                  (data.assets.length ? ` with ${data.assets.join(", ")}` : "") +
                  `. ${data.total} elements are editable.`,
                warnings: data.warnings,
              });
              await loadPages();
            }}
          />
          {notice && (
            <div className="sx-notice" role="status">
              <p>{notice.text}</p>
              {notice.warnings.length > 0 && <ul>{notice.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
            </div>
          )}
          {error && <p className="sx-upload-error" role="alert">{error}</p>}
        </div>
      </div>
    );
  }

  const selectedEl = getEl(selectedId);
  const hoverEl = hoverId && hoverId !== selectedId ? getEl(hoverId) : null;
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  };
  const selBox = selectedEl ? box(selectedEl) : null;
  const marks = mode === "design" ? pendingList.map((c) => c.id).filter((id) => id !== selectedId).map((id) => [id, getEl(id)]).filter(([, el]) => el) : [];

  return (
    <div className="sx-root">
      <header className="sx-top">
        <div className="sx-wordmark">bitlinks<span>/studio</span></div>
        <button className="sx-back" onClick={closePage}>All pages</button>
        <div className={`sx-tab ${pendingList.length ? "dirty" : ""}`} title={pendingList.length ? "Has changes that are not applied yet" : "In sync with the file"}>
          {page.file.replace("client/", "")}
        </div>

        <div className="sx-switch" role="group" aria-label="Mode">
          <button aria-pressed={mode === "design"} onClick={() => setMode("design")}>Edit</button>
          <button aria-pressed={mode === "preview"} onClick={() => { setMode("preview"); setSelectedId(null); }}>Preview</button>
        </div>
        <div className="sx-zoom" role="group" aria-label="Zoom">
          {[0.5, 0.75, 1].map((z) => (
            <button key={z} aria-pressed={zoom === z} onClick={() => setZoom(z)}>{Math.round(z * 100)}</button>
          ))}
          <span>%</span>
        </div>

        <div className="sx-grow" />
        <a className="sx-link" href={page.route} target="_blank" rel="noreferrer">Open live page</a>
        <button className="sx-ghost" disabled={busy} onClick={() => serverAction("/api/undo", "Undid the last apply")}>Undo last apply</button>
        <button className="sx-ghost" disabled={busy} onClick={() => serverAction("/api/reset", "Reset the file to the original")}>Reset file</button>
      </header>

      {error && (
        <div className="sx-error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss">Dismiss</button>
        </div>
      )}

      <div className="sx-body">
        <aside className="sx-side sx-left">
          <div className="sx-tray">
            <h2 className="sx-h">
              Not applied yet
              {pendingList.length > 0 && <span className="sx-tally">{pendingList.length}</span>}
            </h2>
            {pendingList.length === 0 ? (
              <p className="sx-tray-empty">Select something on the board and change it. Your edits collect here.</p>
            ) : (
              <ul className="sx-tickets">
                {pendingList.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => { setSelectedId(c.id); setRightTab("inspect"); }}>
                      <span className="sx-ticket-id">{c.id}</span>
                      {describeChange(c, originals.current.get(c.id)).map((line, i) => <span key={i} className="sx-ticket-line">{line}</span>)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="sx-tray-actions">
              <button className="sx-apply" disabled={!pendingList.length || busy} onClick={apply}>
                {busy ? "Applying..." : `Apply changes${pendingList.length ? ` (${pendingList.length})` : ""}`}
              </button>
              <button className="sx-ghost" disabled={!pendingList.length || busy} onClick={discard}>Discard</button>
            </div>
          </div>
        </aside>

        <main className="sx-center">
          <section className="sx-board" onPointerDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}>
            <div className="sx-sheet" style={{ width: CANVAS_WIDTH * zoom, height: frameHeight * zoom }}>
              <Ruler axis="x" length={CANVAS_WIDTH} zoom={zoom} band={selBox && { start: selBox.left, size: selBox.width }} />
              <Ruler axis="y" length={frameHeight} zoom={zoom} band={selBox && { start: selBox.top, size: selBox.height }} />
              <div ref={stageRef} className="sx-stage" style={{ width: CANVAS_WIDTH, height: frameHeight, transform: `scale(${zoom})` }}>
                <iframe
                  key={frameKey}
                  ref={frameRef}
                  src={`${page.route}?canvas=${frameKey}`}
                  title="Page being edited"
                  onLoad={onFrameLoad}
                  style={{ width: CANVAS_WIDTH, height: frameHeight, pointerEvents: mode === "design" && !editingId ? "none" : "auto" }}
                />
                {mode === "design" && (
                  <div
                    className={`sx-overlay ${editingId ? "editing" : ""}`}
                    onPointerDown={onOverlayPointerDown}
                    onPointerMove={onOverlayPointerMove}
                    onPointerLeave={() => { setHoverId(null); setCursor(null); }}
                    onDoubleClick={onOverlayDoubleClick}
                  >
                    {marks.map(([id, el]) => {
                      const b = box(el);
                      return <div key={id} className="sx-mark" style={{ left: b.left + b.width, top: b.top, transform: `translate(-50%, -50%) scale(${1 / zoom})` }} title={`${id} has changes that are not applied yet`} />;
                    })}
                    {hoverEl && <div className="sx-hover" style={box(hoverEl)} />}
                    {selBox && (
                      <div className="sx-sel" style={selBox}>
                        <div className="sx-sel-tag" style={{ transform: `scale(${1 / zoom})` }}>
                          <b>{selectedEl.tagName.toLowerCase()}</b> {selectedId}
                        </div>
                        <div className="sx-sel-dim" style={{ transform: `translateX(-50%) scale(${1 / zoom})` }}>
                          {Math.round(selBox.width)} x {Math.round(selBox.height)}
                        </div>
                        {!editingId && HANDLES.map((h) => (
                          <div
                            key={h}
                            className={`sx-handle sx-h-${h}`}
                            style={{ transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
                            onPointerDown={(e) => { e.stopPropagation(); startDrag(e, selectedEl, h); }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          <footer className="sx-status">
            <span>{cursor ? `x ${cursor.x}  y ${cursor.y}` : "-"}</span>
            <span>{hoverId || selectedId || "nothing selected"}</span>
            <span className="sx-status-help">
              {editingId
                ? "Typing - Enter to keep, Esc to cancel"
                : mode === "design"
                  ? "Drag to move, corners resize, double-click text, arrows nudge (Shift for 10px)"
                  : "Preview: the page works normally, nothing is editable"}
            </span>
          </footer>
        </main>

        <aside className="sx-side sx-right">
          <div className="sx-tabs" role="tablist">
            <button role="tab" aria-selected={rightTab === "inspect"} onClick={() => setRightTab("inspect")}>Properties</button>
            <button role="tab" aria-selected={rightTab === "code"} onClick={() => setRightTab("code")}>
              Code{lastApply && <i className="sx-new" aria-label="updated" />}
            </button>
          </div>
          {rightTab === "inspect" ? (
            <Inspector
              file={page.file}
              el={selectedEl}
              id={selectedId}
              source={source}
              pending={pending[selectedId]}
              commit={commit}
              onMoveSibling={(dir) => {
                if (!selectedEl) return;
                const ref = dir < 0 ? selectedEl.previousElementSibling : selectedEl.nextElementSibling;
                moveSibling(selectedEl, ref, dir > 0);
              }}
              onEditText={() => selectedEl && isTextOnly(selectedEl) && startTextEdit(selectedEl)}
            />
          ) : (
            <CodePanel file={page.file} source={source} lastApply={lastApply} verify={verify} selectedId={selectedId} />
          )}
        </aside>
      </div>
    </div>
  );
}

// rulers measure real page px and highlight the selection
function Ruler({ axis, length, zoom, band }) {
  const step = zoom < 0.75 ? 200 : 100;
  const labels = [];
  for (let v = 0; v <= length; v += step) labels.push(v);
  const horizontal = axis === "x";
  const size = length * zoom;
  return (
    <div
      className={`sx-ruler sx-ruler-${axis}`}
      style={{ [horizontal ? "width" : "height"]: size, "--tick": `${10 * zoom}px`, "--major": `${100 * zoom}px` }}
      aria-hidden
    >
      {band && (
        <div
          className="sx-ruler-band"
          style={horizontal ? { left: band.start * zoom, width: band.size * zoom } : { top: band.start * zoom, height: band.size * zoom }}
        />
      )}
      {labels.map((v) => (
        <span key={v} style={{ [horizontal ? "left" : "top"]: v * zoom }}>{v}</span>
      ))}
    </div>
  );
}
