"use client";

// one html file plus its css images and fonts
import { useRef, useState } from "react";

const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED = /\.(html?|css|png|jpe?g|gif|svg|webp|avif|ico|bmp|woff2?|ttf|otf)$/i;
const TEXT = /\.(html?|css|svg)$/i;

function readFile(file) {
  if (TEXT.test(file.name)) return file.text().then((content) => ({ name: file.name, content, encoding: "utf8" }));
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, content: String(r.result).split(",")[1] || "", encoding: "base64" });
    r.onerror = () => reject(new Error(`Couldn't read ${file.name}`));
    r.readAsDataURL(file);
  });
}

export default function Uploader({ onUploaded }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async (fileList) => {
    setError("");
    const files = [...(fileList || [])];
    if (!files.length) return;
    const html = files.filter((f) => /\.html?$/i.test(f.name));
    if (html.length !== 1) {
      return setError(html.length ? "Choose only one .html file at a time." : "Include the page's .html file. Add its .css files and images in the same selection.");
    }
    const bad = files.filter((f) => !ALLOWED.test(f.name));
    if (bad.length) return setError(`Can't upload ${bad.map((f) => f.name).join(", ")}. Only .html, .css, images and fonts are accepted.`);
    if (files.reduce((n, f) => n + f.size, 0) > MAX_BYTES) return setError("These files add up to more than 6 MB.");

    setBusy(true);
    try {
      const payload = await Promise.all(files.map(readFile));
      const r = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: payload }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || `Upload failed (HTTP ${r.status})`);
      onUploaded(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="sx-upload-wrap">
      <label
        className={`sx-upload ${over ? "is-over" : ""} ${busy ? "is-busy" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); send(e.dataTransfer.files); }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".html,.htm,.css,image/*,.woff,.woff2,.ttf,.otf"
          onChange={(e) => send(e.target.files)}
          disabled={busy}
        />
        <span className="sx-upload-main">{busy ? "Uploading..." : "Upload an HTML page"}</span>
        <span className="sx-upload-sub">Select the .html file together with its .css files and images, or drop them all here</span>
      </label>
      {error && <p className="sx-upload-error" role="alert">{error}</p>}
    </div>
  );
}
