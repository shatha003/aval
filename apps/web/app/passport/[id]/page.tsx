"use client";

import { computeStanding } from "@aval/core";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { Sigil } from "@/components/Sigil";
import { dateOf, pct, short, tag, usd } from "@/lib/format";
import { useWorld } from "@/lib/world-context";

const ROLE: Record<string, string> = { principal: "Issuer", buyer: "Buyer agent", vendor: "Vendor agent", background: "Marketplace agent" };

export default function Passport() {
  const { id } = useParams<{ id: string }>();
  const { world } = useWorld();

  const data = useMemo(() => {
    if (!world || !world.actors[id]) return null;
    const a = world.actor(id);
    const receipts = world.receiptsFor(a.signer.did);
    const standing = computeStanding({ holder: a.signer.did, receipts, attestations: a.attestations, now: world.now, directory: world.receiptsFor });
    return { a, receipts, standing };
  }, [world, id]);

  if (!world) return <main className="page"><p className="notice">Opening the passport…</p></main>;
  if (!data) return <main className="page"><p className="notice bad">No such agent. <Link href="/">Back to the Floor</Link></p></main>;
  const { a, receipts, standing } = data;
  const recent = [...receipts].reverse().slice(0, 14);

  return (
    <main className="page">
      <section className="pass-hero">
        <div className="pass-seal"><Sigil did={a.signer.did} size={168} title={`${a.name}'s seal`} /></div>
        <div>
          <span className="label">Passport · {ROLE[a.role]}</span>
          <h1>{a.name}</h1>
          <p className="lede">{a.blurb}</p>
          <p className="mono did" title={a.signer.did}>{a.signer.did}</p>
        </div>
      </section>

      <section className="doc">
        <h2>Authority</h2>
        {a.chain.length === 0 ? (
          <p className="muted">Issues credentials rather than holding them.</p>
        ) : (
          <div className="visas">
            {a.chain.map((c, i) => {
              const revoked = !!world.lists.get(c.issuer)?.revoked.includes(c.id);
              const s = c.credentialSubject;
              return (
                <article key={c.id} className={`visa ${revoked ? "void" : ""}`}>
                  <header>
                    <span className="label">{i === 0 ? "Grant" : `Delegated from · link ${i + 1}`}</span>
                    <span className="mono dim">{tag(c.id)}</span>
                  </header>
                  <p className="visa-line"><b>{world.nameOf(c.issuer)}</b> authorises <b>{world.nameOf(s.id)}</b></p>
                  <ul>
                    {s.scopes.map((sc) => (
                      <li key={sc.action}><span className="mono">{sc.action}</span> {sc.maxValue !== undefined ? `up to ${usd(sc.maxValue)}` : "unlimited"}</li>
                    ))}
                    <li>{s.remainingDepth > 0 ? `may delegate ${s.remainingDepth} more level${s.remainingDepth > 1 ? "s" : ""}` : "cannot delegate further"}</li>
                    <li className="mono dim">valid {dateOf(c.validFrom)} → {dateOf(c.validUntil)}</li>
                  </ul>
                  {revoked && <div className="void-stamp">Revoked</div>}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {a.attestations.length > 0 && (
        <section className="doc">
          <h2>Vouches</h2>
          <ul className="plain">
            {a.attestations.map((v) => (
              <li key={v.id}>
                <b>{world.nameOf(v.issuer)}</b>: “{v.credentialSubject.claim}” <span className="mono dim">weight {v.credentialSubject.weight}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="doc">
        <h2>Standing</h2>
        <div className="evidence-sum">
          <div><span className="label">Receipts</span><b className="num">{standing.receiptCount}</b></div>
          <div><span className="label">Independent counterparties</span><b className="num">{standing.distinctCounterparties}</b></div>
          <div><span className="label">Mean</span><b className="num">{pct(standing.mean, 1)}</b></div>
          <div className="key"><span className="label">Lower bound</span><b className="num">{pct(standing.lowerBound, 1)}</b></div>
          <div><span className="label">Vouch boost</span><b className="num">+{standing.vouchBoost.toFixed(2)}</b></div>
        </div>
        <p className="muted small">Derived only from co-signed receipts below. Each verifier recomputes this itself; there is no stored score.</p>
      </section>

      <section className="doc">
        <h2>History <small className="mono dim">most recent {recent.length} of {receipts.length}</small></h2>
        {recent.length === 0 ? (
          <p className="muted">No co-signed history.</p>
        ) : (
          <table className="ledger wide">
            <thead><tr><th>Date</th><th>Counterparty</th><th>Task</th><th className="r">Value</th><th>Outcome</th><th>Chain</th></tr></thead>
            <tbody>
              {recent.map((r) => {
                const cp = r.requester === a.signer.did ? r.provider : r.requester;
                return (
                  <tr key={r.id}>
                    <td className="mono">{dateOf(r.completedAt)}</td>
                    <td>{world.nameOf(cp)}</td>
                    <td>{r.task.description}</td>
                    <td className="r mono">{usd(r.task.value)}</td>
                    <td className={r.outcome === "fulfilled" ? "" : "bad"}>{r.outcome}</td>
                    <td className="mono dim">{r.prev[a.signer.did] ? `↩ ${short(r.prev[a.signer.did]!.split(":").pop()!, 6, 3)}` : "genesis"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
