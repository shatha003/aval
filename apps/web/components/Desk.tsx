"use client";

import type { Evaluation, StageResult, World } from "@aval/core";
import { dateOf, pct, short, tag, usd, words } from "@/lib/format";
import type { HistoryEntry } from "@/lib/world-context";
import { Stamp } from "./Stamp";

const mark = (s: StageResult["status"] | "pending") =>
  s === "pass" ? "ok" : s === "fail" ? "no" : s === "skipped" ? "skip" : "wait";

/* ------------------------------------------------------------------ trace -- */

export function Trace({ evaluation, revealed, busy }: { evaluation: Evaluation | null; revealed: number; busy: boolean }) {
  const rows: Array<StageResult | null> = evaluation ? evaluation.trace : Array(10).fill(null);
  return (
    <ol className="trace" aria-live="polite" aria-busy={busy}>
      {rows.map((s, i) => {
        const shown = !!s && i < revealed;
        const state = shown ? s!.status : "pending";
        return (
          <li key={i} className={`trace-row is-${mark(state)}`}>
            <span className="trace-n">{String(i + 1).padStart(2, "0")}</span>
            <span className="trace-box" aria-hidden="true" />
            <div className="trace-body">
              <div className="trace-name">
                {STAGE_LABELS[i]}
                {shown && s!.status !== "pass" && <span className="trace-code">{s!.code === "SKIPPED" ? "not reached" : words(s!.code)}</span>}
              </div>
              {shown && s!.status !== "skipped" && <p className="trace-detail">{s!.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const STAGE_LABELS = [
  "Who is this?",
  "Are the signatures real?",
  "Does authority trace to someone I trust?",
  "Is it in date?",
  "Has it been revoked?",
  "Does delegation only narrow?",
  "Can they prove it's theirs?",
  "Is the history unbroken?",
  "What is their standing?",
  "What does my policy say?",
];

/* ---------------------------------------------------------------- receipt -- */

export function Receipt({
  world,
  entry,
  revealed,
  done,
}: {
  world: World;
  entry: HistoryEntry | null;
  revealed: number;
  done: boolean;
}) {
  if (!entry) {
    return (
      <div className="receipt receipt-blank">
        <p className="receipt-hint">
          A decision prints here: ten checks, a verdict, and a signature anyone can verify.
        </p>
      </div>
    );
  }
  const { evaluation: e, presenterId, verifierId, value, policy } = entry;
  const r = e.receipt;
  const nameOf = (id: string) => world.actor(id).name;
  return (
    <div className="receipt" key={r.id}>
      <div className="receipt-head">
        <span className="receipt-title">Decision receipt</span>
        <span className="mono receipt-no">№ {tag(r.id)}</span>
      </div>
      <dl className="receipt-meta">
        <div><dt>Evaluator</dt><dd>{nameOf(verifierId)}</dd></div>
        <div><dt>Subject</dt><dd>{nameOf(presenterId)}</dd></div>
        <div><dt>Request</dt><dd>{r.request.action} · {usd(value)}</dd></div>
        <div><dt>Policy</dt><dd>{policy.id}</dd></div>
      </dl>
      <ul className="receipt-lines">
        {e.trace.map((s, i) => (
          <li key={i} className={i < revealed ? "in" : ""}>
            <span>{String(i + 1).padStart(2, "0")} {s.name}</span>
            <i />
            <b className={`st-${s.status}`}>{s.status === "pass" ? "PASS" : s.status === "fail" ? "FAIL" : "—"}</b>
          </li>
        ))}
      </ul>
      <div className={`receipt-foot ${done ? "in" : ""}`}>
        <div className="receipt-verdict">
          <span className="label">Verdict</span>
          <strong>{r.verdict.replace(/_/g, " ")}</strong>
        </div>
        <ul className="receipt-because">
          {r.reasons.map((x, i) => (
            <li key={i} className={x.polarity}>{x.message}</li>
          ))}
        </ul>
        {r.conditions.length > 0 && (
          <ul className="receipt-conds">
            {r.conditions.map((c, i) => (
              <li key={i}><b>{c.kind}</b>{c.amount !== undefined ? ` ${usd(c.amount)}` : ""} — {c.note}</li>
            ))}
          </ul>
        )}
        <div className="receipt-sig mono">
          <span>sig {short(r.proof.proofValue, 14, 6)}</span>
          <span>prev {r.prev ? tag(r.prev) : "genesis"}</span>
        </div>
        <Stamp key={r.id} verdict={r.verdict} date={dateOf(r.decidedAt)} />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- evidence -- */

export function Evidence({ world, evaluation }: { world: World; evaluation: Evaluation }) {
  const s = evaluation.standing;
  if (!s) {
    const f = evaluation.verification.failedAt;
    return (
      <div className="evidence-empty">
        <p>
          Standing was never computed: the presentation failed at stage {f?.stage} ({f?.name.toLowerCase()}). A failed
          check is a refusal, so nothing downstream is trusted, scored or averaged.
        </p>
      </div>
    );
  }
  const lines = [...s.evidence].sort((a, b) => b.weight - a.weight).slice(0, 10);
  return (
    <div className="evidence">
      <div className="evidence-sum">
        <div><span className="label">Evidence for</span><b className="num">{s.alpha.toFixed(1)}</b></div>
        <div><span className="label">Against</span><b className="num">{s.beta.toFixed(1)}</b></div>
        <div><span className="label">Mean</span><b className="num">{pct(s.mean, 1)}</b></div>
        <div className="key"><span className="label">Lower bound · what policy reads</span><b className="num">{pct(s.lowerBound, 1)}</b></div>
        <div><span className="label">Independent counterparties</span><b className="num">{s.distinctCounterparties}</b></div>
      </div>

      <div className="evidence-cols">
        <section>
          <h4>History <small>top {lines.length} of {s.evidence.length} receipts by weight</small></h4>
          {lines.length === 0 ? (
            <p className="muted">No co-signed history. This is an unknown agent, which is not the same as a bad one.</p>
          ) : (
            <table className="ledger">
              <thead><tr><th>Counterparty</th><th>Outcome</th><th className="r">Counted</th><th>Receipt</th></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.receiptId}>
                    <td>{world.nameOf(l.counterparty)}</td>
                    <td className={l.outcome === "fulfilled" ? "" : "bad"}>{l.outcome}</td>
                    <td className="r mono">
                      {l.weight.toFixed(2)}
                      {l.capped && <em title="This counterparty has already contributed its maximum">capped</em>}
                    </td>
                    <td className="mono">{tag(l.receiptId)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h4>Vouches <small>boost +{s.vouchBoost.toFixed(2)}</small></h4>
          {s.vouches.length === 0 ? (
            <p className="muted">Nobody vouches for this agent.</p>
          ) : (
            <table className="ledger">
              <thead><tr><th>Voucher</th><th className="r">Independent</th><th className="r">Weight</th><th>Why</th></tr></thead>
              <tbody>
                {s.vouches.map((v) => (
                  <tr key={v.attestationId} className={v.counted ? "" : "void"}>
                    <td>{world.nameOf(v.voucher)}</td>
                    <td className="r mono">{v.voucherIndependentCounterparties}</td>
                    <td className="r mono">{v.weight.toFixed(2)}</td>
                    <td className="why">{v.counted ? "counted" : "carries no weight: no independent history"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
