"use client";

import { useEffect, useRef } from "react";

function DiffView({ diff }) {
  const lines = diff.split("\n").slice(4);
  return (
    <pre className="sx-diff">
      {lines.map((l, i) => {
        const cls = l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : l.startsWith("@@") ? "hunk" : "";
        return <div key={i} className={cls}>{l || " "}</div>;
      })}
    </pre>
  );
}

export default function CodePanel({ file, source, lastApply, verify, selectedId }) {
  const hlRef = useRef(null);
  const preRef = useRef(null);
  const lines = source.split("\n");
  const marker = selectedId ? `data-edit-id="${selectedId}"` : null;

  useEffect(() => {
    const pre = preRef.current;
    const hl = hlRef.current;
    if (pre && hl) pre.scrollTop = hl.offsetTop - pre.clientHeight / 2; 
  }, [selectedId, source]);

  return (
    <div className="sx-code">
      {lastApply ? (
        <section className="sx-group">
          <h3>
            {lastApply.action || `Wrote ${lastApply.count} change${lastApply.count === 1 ? "" : "s"} to the file`}
            <time>{lastApply.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
          </h3>
          {verify ? (
            verify.failed.length === 0 ? (
              <p className="sx-check ok">
                {verify.checked
                  ? `Live page reloaded. All ${verify.checked} changed values match.`
                  : "Live page reloaded."}
              </p>
            ) : (
              <p className="sx-check bad">
                Live page reloaded, but {verify.failed.length} value{verify.failed.length === 1 ? "" : "s"} differ: {verify.failed.join("; ")}
              </p>
            )
          ) : (
            <p className="sx-check wait">Reloading the live page to check it...</p>
          )}
          {lastApply.notes?.filter((n) => n.startsWith("skipped: ")).map((n, i) => (
            <p key={i} className="sx-check bad">{n.replace(/^skipped: /, "Skipped ")}</p>
          ))}
          {lastApply.changed === false ? (
            <p className="sx-quiet">Nothing was written to the file.</p>
          ) : lastApply.diff ? (
            <DiffView diff={lastApply.diff} />
          ) : null}
        </section>
      ) : (
        <section className="sx-group">
          <p className="sx-quiet">Nothing applied yet. When you apply changes, the lines that changed in the file show up here.</p>
        </section>
      )}

      <section className="sx-group sx-group-fill">
        <h3>{file.replace("client/", "")}</h3>
        <pre className="sx-source" ref={preRef}>
          {lines.map((l, i) => {
            const hl = marker && l.includes(marker);
            return (
              <div key={i} ref={hl ? hlRef : null} className={hl ? "hl" : ""}>
                <span className="ln">{i + 1}</span>{l}
              </div>
            );
          })}
        </pre>
      </section>
    </div>
  );
}
