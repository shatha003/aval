"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Evidence, Receipt, Trace } from "@/components/Desk";
import { Sigil } from "@/components/Sigil";
import { toneOf } from "@/components/Stamp";
import { PITCHES } from "@/content/pitches";
import { usd } from "@/lib/format";
import { useWorld, type Direction, type HistoryEntry } from "@/lib/world-context";

const CAST = ["halcyon", "fennel", "clone", "greedy", "ringo1", "mallory", "vesper"];
const PRESETS = [300, 3_000, 20_000];

const KIND: Record<string, string> = {
  halcyon: "veteran",
  fennel: "newcomer",
  clone: "impostor",
  greedy: "over-reacher",
  ringo1: "ring",
  mallory: "self-appointed",
  vesper: "revocable",
};

export default function Floor() {
  const { world, error, check, history, toggleRevoke, isRevoked, reset } = useWorld();
  const [direction, setDirection] = useState<Direction>("buyer-checks-vendor");
  const [selected, setSelected] = useState("halcyon");
  const [value, setValue] = useState(3_000);
  const [entry, setEntry] = useState<HistoryEntry | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  const clear = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    setEntry(null);
    setRevealed(0);
    setBusy(false);
  }, []);

  const run = useCallback(() => {
    if (!world || busy) return;
    clear();
    setBusy(true);
    // Let "presenting…" paint before the signature checks occupy the thread.
    setTimeout(() => {
      const e = check({ direction, counterpartId: selected, value });
      setEntry(e);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setRevealed(10);
        setBusy(false);
        return;
      }
      let i = 0;
      timer.current = setInterval(() => {
        i++;
        if (e.evaluation.trace[i - 1]?.status === "skipped") i = 10;
        setRevealed(Math.min(i, 10));
        if (i >= 10 && timer.current) {
          clearInterval(timer.current);
          setBusy(false);
        }
      }, 240);
    }, 50);
  }, [world, busy, clear, check, direction, selected, value]);

  // Deep links for demos and the walkthrough: /?agent=fennel&value=400&dir=vendor&run=1
  const [auto, setAuto] = useState(false);
  const linked = useRef(false);
  useEffect(() => {
    if (!world || linked.current) return;
    linked.current = true;
    const q = new URLSearchParams(window.location.search);
    const agent = q.get("agent");
    if (agent && CAST.includes(agent)) setSelected(agent);
    const v = Number(q.get("value"));
    if (v > 0) setValue(v);
    if (q.get("dir") === "vendor") setDirection("vendor-checks-buyer");
    if (q.get("run") === "1") setAuto(true);
  }, [world]);
  useEffect(() => {
    if (auto && world) {
      setAuto(false);
      run();
    }
  }, [auto, world, run]);

  if (error) return <main className="page"><p className="notice bad">Could not open the world: {error}</p></main>;

  const buyerMode = direction === "buyer-checks-vendor";
  const presenterId = buyerMode ? selected : "atlas";
  const done = !!entry && revealed >= 10 && !busy;
  const name = (id: string) => world?.actor(id).name ?? id;

  return (
    <main className="page">
      <section className="hero">
        <h1>
          Every agent carries a <em>passport.</em>
          <br />
          Every counterparty runs a <em>checkpoint.</em>
        </h1>
        <p className="lede">
          Pick an agent, name a price, and watch the gate check what it can prove: who it is, what it may do, what it has
          done, and who stands behind it. No score without a receipt.
        </p>
      </section>

      <section className="floor" aria-label="The Floor">
        {/* ------------------------------------------------ the queue -- */}
        <div className="col col-queue">
          <div className="col-head">
            <span className="label">01 · The queue</span>
            <div className="seg" role="group" aria-label="Direction">
              <button className={buyerMode ? "on" : ""} onClick={() => { setDirection("buyer-checks-vendor"); clear(); }}>
                Atlas checks vendor
              </button>
              <button className={!buyerMode ? "on" : ""} onClick={() => { setDirection("vendor-checks-buyer"); clear(); }}>
                Vendor checks Atlas
              </button>
            </div>
          </div>

          <p className="col-note">
            {buyerMode
              ? "Atlas buys work for Acme Corp. Who is presenting at its desk?"
              : "Trust runs both ways. Atlas presents at a vendor's desk, under the vendor's own rules. Whose desk?"}
          </p>

          <ul className="roster">
            {CAST.map((id) => {
              const a = world?.actors[id];
              return (
                <li key={id}>
                  <button
                    className={`rost ${selected === id ? "on" : ""}`}
                    onClick={() => { setSelected(id); clear(); }}
                    aria-pressed={selected === id}
                  >
                    <span className="rost-seal">{a ? <Sigil did={a.signer.did} size={46} /> : <span className="seal-ph" />}</span>
                    <span className="rost-main">
                      <span className="rost-name">{a?.name ?? "…"}</span>
                      <span className="rost-kind">{KIND[id]}</span>
                      <span className="rost-blurb">{a?.blurb}</span>
                    </span>
                  </button>
                  <Link className="rost-passport" href={`/passport/${id}`}>passport</Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* ----------------------------------------------- the checkpoint -- */}
        <div className="col col-gate">
          <div className="col-head">
            <span className="label">02 · The checkpoint</span>
            {entry && <span className={`pill pill-${toneOf(entry.evaluation.decision.verdict)}`}>{done ? entry.evaluation.decision.verdict.replace(/_/g, " ") : "checking"}</span>}
          </div>

          <div className="ask">
            <p className="ask-line">
              {buyerMode ? (
                <>
                  <b>Atlas</b> asks <b>{name(selected)}</b> to accept a <b>{usd(value)}</b> task.
                </>
              ) : (
                <>
                  <b>Atlas</b> asks <b>{name(selected)}</b> to take on a <b>{usd(value)}</b> task.
                </>
              )}
            </p>
            <div className="ask-controls">
              <label className="amount">
                <span className="label">Task value</span>
                <span className="amount-field">
                  <i>$</i>
                  <input
                    type="number"
                    min={1}
                    max={1000000}
                    value={value}
                    onChange={(e) => { setValue(Math.max(1, Number(e.target.value) || 1)); clear(); }}
                    aria-label="Task value in US dollars"
                  />
                </span>
              </label>
              <div className="chips" role="group" aria-label="Presets">
                {PRESETS.map((p) => (
                  <button key={p} className={value === p ? "on" : ""} onClick={() => { setValue(p); clear(); }}>{usd(p)}</button>
                ))}
              </div>
            </div>
            <div className="ask-actions">
              <button className="btn" onClick={run} disabled={!world || busy}>
                {busy ? "Presenting…" : "Present at the gate"}
              </button>
              <button className="btn btn-quiet" onClick={() => { toggleRevoke(presenterId); clear(); }} disabled={!world}>
                {isRevoked(presenterId) ? `Restore ${name(presenterId)}'s authority` : `Revoke ${name(presenterId)}'s authority`}
              </button>
            </div>
            {isRevoked(presenterId) && <p className="note-warn">{name(presenterId)}'s root grant is on its issuer's revocation list.</p>}
          </div>

          {PITCHES[presenterId] && (
            <figure className={`pitch ${presenterId === "mallory" ? "pitch-warn" : ""}`}>
              <figcaption>
                <span className="label">{name(presenterId)} says</span>
                {PITCHES[presenterId]!.tag && <span className="pitch-tag">{PITCHES[presenterId]!.tag}</span>}
              </figcaption>
              <blockquote>“{PITCHES[presenterId]!.say}”</blockquote>
              {done && PITCHES[presenterId]!.after && <p className="pitch-after">{PITCHES[presenterId]!.after}</p>}
            </figure>
          )}

          <Trace evaluation={entry?.evaluation ?? null} revealed={revealed} busy={busy} />
        </div>

        {/* ------------------------------------------------- the receipt -- */}
        <div className="col col-receipt">
          <div className="col-head">
            <span className="label">03 · The receipt</span>
            {entry && done && (
              <Link href="/verify" className="link-quiet">Verify it yourself →</Link>
            )}
          </div>
          {world ? <Receipt world={world} entry={entry} revealed={revealed} done={done} /> : <div className="receipt receipt-blank"><p className="receipt-hint">Opening the gate…</p></div>}
        </div>
      </section>

      {entry && done && world && (
        <section className="why" aria-label="Why this standing">
          <div className="why-head">
            {entry.evaluation.standing ? (
              <>
                <h2>Why this standing?</h2>
                <p>
                  Every number here comes from signed receipts. Nothing is typed in, and no vendor can write its own history.
                  Policy reads the <b>lower bound</b>, not the average, so a lucky short record can’t buy trust.
                </p>
              </>
            ) : (
              <>
                <h2>Why it stopped here</h2>
                <p>The gate fails closed: the first check that cannot be proven ends the interaction.</p>
              </>
            )}
          </div>
          <Evidence world={world} evaluation={entry.evaluation} />
        </section>
      )}

      <section className="log" aria-label="Decision log">
        <div className="log-head">
          <span className="label">Decision log · hash-chained, signed by each evaluator</span>
          <button className="link-quiet" onClick={() => { reset(); clear(); }}>Reset the world</button>
        </div>
        {history.length === 0 ? (
          <p className="muted">Nothing decided yet.</p>
        ) : (
          <ul>
            {history.slice(0, 8).map((h) => (
              <li key={h.n}>
                <span className={`dot dot-${toneOf(h.evaluation.decision.verdict)}`} />
                <span>{world?.actor(h.verifierId).name} ← {world?.actor(h.presenterId).name}</span>
                <span className="mono">{usd(h.value)}</span>
                <b>{h.evaluation.decision.verdict.replace(/_/g, " ").toLowerCase()}</b>
                <span className="mono dim">{h.evaluation.decision.code.toLowerCase().replace(/_/g, " ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
