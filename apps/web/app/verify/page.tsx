"use client";

import { useEffect, useMemo, useState } from "react";
import { inspect, tamper, type Inspection } from "@/lib/inspect";
import { useWorld } from "@/lib/world-context";

interface Sample {
  id: string;
  label: string;
  doc: unknown;
}

export default function VerifyPage() {
  const { world, history } = useWorld();
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const samples: Sample[] = useMemo(() => {
    if (!world) return [];
    const h = world.actor("halcyon");
    const list: Sample[] = [];
    if (history[0]) list.push({ id: "latest", label: "Latest decision receipt", doc: history[0].evaluation.receipt });
    list.push(
      { id: "grant", label: "Halcyon's authority grant", doc: h.chain[0] },
      { id: "receipt", label: "A co-signed receipt", doc: world.receiptsFor(h.signer.did)[3] },
      { id: "vouch", label: "A vouch for Halcyon", doc: h.attestations[0] },
      { id: "revocations", label: "Registry revocation list", doc: world.lists.get(world.actor("registry").signer.did) },
    );
    return list;
  }, [world, history]);

  // Open on the freshest thing the visitor has produced, otherwise a grant.
  useEffect(() => {
    if (!text && samples[0]) setText(JSON.stringify(samples[0].doc, null, 2));
  }, [samples, text]);

  const result = useMemo<{ ok: true; data: Inspection } | { ok: false; error: string } | null>(() => {
    if (!world || !text.trim()) return null;
    try {
      return { ok: true, data: inspect(JSON.parse(text), (d) => world.nameOf(d)) };
    } catch (e) {
      return { ok: false, error: e instanceof SyntaxError ? `Not valid JSON: ${e.message}` : String((e as Error).message) };
    }
  }, [text, world]);

  const load = (s: Sample) => {
    setText(JSON.stringify(s.doc, null, 2));
    setNote(null);
  };

  const doTamper = () => {
    try {
      const t = tamper(JSON.parse(text));
      setText(JSON.stringify(t.doc, null, 2));
      setNote(t.note);
    } catch {
      setNote("Fix the JSON first.");
    }
  };

  return (
    <main className="page">
      <section className="hero hero-sub">
        <h1>
          Don’t trust this page. <em>Check it.</em>
        </h1>
        <p className="lede">
          Everything AVAL produces is a plain signed document. Paste one below, or take one of ours. Verification runs
          in your browser with no server involved. Change a single byte and watch the exact check fail.
        </p>
      </section>

      <section className="verify">
        <div className="verify-in">
          <div className="col-head">
            <span className="label">The document</span>
            <div className="chips" role="group" aria-label="Samples">
              {samples.map((s) => (
                <button key={s.id} onClick={() => load(s)}>{s.label}</button>
              ))}
            </div>
          </div>
          <textarea
            className="json"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setNote(null);
            }}
            spellCheck={false}
            aria-label="Document JSON"
            rows={22}
          />
          <div className="ask-actions">
            <button className="btn" onClick={doTamper} disabled={!result?.ok}>Tamper with it</button>
            {note && <span className="note-warn">Changed {note}. Same signature, different bytes.</span>}
          </div>
        </div>

        <div className="verify-out">
          <div className="col-head"><span className="label">The result</span></div>
          {!result ? (
            <p className="muted">Waiting for a document…</p>
          ) : !result.ok ? (
            <p className="notice bad" style={{ margin: 0 }}>{result.error}</p>
          ) : (
            <>
              <div className={`verdict-box ${result.data.ok ? "good" : "bad"}`}>
                <span className="label">{result.data.kind}</span>
                <strong>{result.data.ok ? "Verifies" : "Does not verify"}</strong>
                <p>{result.data.summary}</p>
              </div>
              <ol className="trace">
                {result.data.checks.map((c, i) => (
                  <li key={i} className={`trace-row ${c.ok ? "is-ok" : "is-no"}`}>
                    <span className="trace-n">{String(i + 1).padStart(2, "0")}</span>
                    <span className="trace-box" aria-hidden="true" />
                    <div className="trace-body">
                      <div className="trace-name">{c.label}</div>
                      <p className="trace-detail">{c.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="muted small">
                These checks use the same open-source library as the gate (<span className="mono">@aval/core</span>):
                canonical JSON (RFC 8785), SHA-256, Ed25519. A third party could reimplement them in an afternoon, and
                that is the point.
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
