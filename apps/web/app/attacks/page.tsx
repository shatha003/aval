"use client";

import { ATTACKS, type Attack, type AttackRun } from "@aval/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { words } from "@/lib/format";
import { useWorld } from "@/lib/world-context";

type Result = { run: AttackRun; ms: number };

export default function AttackLab() {
  const { world, fresh } = useWorld();
  const [results, setResults] = useState<Record<string, Result>>({});
  const [running, setRunning] = useState<string | null>(null);

  const runOne = useCallback(
    (a: Attack) =>
      new Promise<void>((resolve) => {
        setRunning(a.id);
        // Yield so the button state paints; each attack gets its own pristine world.
        setTimeout(() => {
          const t0 = performance.now();
          const run = a.run(fresh());
          setResults((r) => ({ ...r, [a.id]: { run, ms: performance.now() - t0 } }));
          setRunning(null);
          resolve();
        }, 30);
      }),
    [fresh],
  );

  const runAll = useCallback(async () => {
    for (const a of ATTACKS) await runOne(a);
  }, [runOne]);

  // /attacks?run=all starts the full run on load (handy for demos and screenshots).
  const started = useRef(false);
  useEffect(() => {
    if (!world || started.current) return;
    started.current = true;
    if (new URLSearchParams(window.location.search).get("run") === "all") void runAll();
  }, [world, runAll]);

  const caught =Object.values(results).filter((r) => r.run.evaluation.decision.verdict === "REFUSE").length;

  return (
    <main className="page">
      <section className="hero hero-sub">
        <h1>
          Ten ways in. <em>Ten refusals.</em>
        </h1>
        <p className="lede">
          Each attack runs for real against the same verifier you used on the Floor, in a sealed copy of the world.
          Nothing is simulated: forged documents are forged, signatures are checked, and the stage that stops each one is
          the stage that actually failed. The same ten run as tests in CI.
        </p>
        <div className="lab-actions">
          <button className="btn" onClick={runAll} disabled={!world || running !== null}>
            {running ? "Running…" : "Run all ten"}
          </button>
          {Object.keys(results).length > 0 && (
            <span className="mono lab-tally">
              {caught} / {Object.keys(results).length} refused
            </span>
          )}
        </div>
      </section>

      <ol className="attacks">
        {ATTACKS.map((a) => {
          const res = results[a.id];
          const e = res?.run.evaluation;
          const stopped = e?.trace.find((s) => s.status === "fail");
          return (
            <li key={a.id} className="attack">
              <div className="attack-id">{a.id}</div>
              <div className="attack-body">
                <h2>{a.title}</h2>
                <p className="attack-threat"><span className="label">Attack</span>{a.threat}</p>
                <p className="attack-defence"><span className="label">Defence</span>{a.defence}</p>
                <p className="attack-expect mono">Expected: stage {a.stage} · {words(a.code)}</p>
              </div>
              <div className="attack-result">
                <div className="strip" role="img" aria-label={stopped ? `Stopped at stage ${stopped.stage}` : "not yet run"}>
                  {Array.from({ length: 10 }, (_, i) => {
                    const s = e?.trace[i];
                    const cls = !s ? "wait" : s.status === "pass" ? "ok" : s.status === "fail" ? "no" : "skip";
                    return <span key={i} className={`strip-cell ${cls}`}><i>{i + 1}</i></span>;
                  })}
                </div>
                {res && e ? (
                  <div className="attack-out">
                    {res.run.prelude && <p className="attack-prelude">{res.run.prelude}</p>}
                    <p className="attack-verdict">
                      <b className={e.decision.verdict === "REFUSE" ? "t-refuse" : "t-accept"}>{e.decision.verdict}</b>
                      {stopped && <> at stage {stopped.stage}: <span className="mono">{words(stopped.code)}</span></>}
                    </p>
                    <p className="attack-why">{e.decision.reasons.find((r) => r.polarity === "against")?.message ?? e.decision.reasons[0]?.message}</p>
                    <p className="mono dim">{res.ms.toFixed(0)} ms · decision receipt signed</p>
                  </div>
                ) : (
                  <button className="btn btn-quiet" onClick={() => runOne(a)} disabled={!world || running !== null}>
                    {running === a.id ? "Running…" : "Run this attack"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
