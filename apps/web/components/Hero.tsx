"use client";

import { ATTACKS } from "@aval/core";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Sigil } from "./Sigil";

/** Headline whose letters drop into place one by one. Screen readers get the plain text. */
export function Kinetic({ lines, children }: { lines: string[]; children?: React.ReactNode }) {
  let n = 0;
  return (
    <h1 className="kinetic" aria-label={lines.join(" ")}>
      {lines.map((line) => (
        <span key={line} className="w" aria-hidden="true">
          {[...line].map((ch, i) => (
            <span key={i} className="c" style={{ "--i": n++ } as CSSProperties}>
              {ch === " " ? " " : ch}
            </span>
          ))}
        </span>
      ))}
      {children}
    </h1>
  );
}

const OUTCOMES = [
  { word: "Admitted", tone: "accept" },
  { word: "Refused", tone: "refuse" },
  { word: "On conditions", tone: "cond" },
] as const;

/** The three things the gate can say, stamped in turn. Static under reduced motion. */
export function HeroStamp() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % OUTCOMES.length), 2600);
    return () => clearInterval(t);
  }, []);
  const o = OUTCOMES[i]!;
  return (
    <span className="hero-stamp" aria-hidden="true">
      <span key={i} className={`stamp stamp-${o.tone}`} style={{ position: "static", display: "inline-block", animationDelay: i === 0 ? "0.9s" : "0s" }}>
        <span className="stamp-inner">
          <span className="stamp-word">{o.word}</span>
          <span className="stamp-date">AVAL checkpoint</span>
        </span>
      </span>
    </span>
  );
}

/** A seal that turns: the motto around the outside, an agent's key-derived sigil inside. */
export function Badge({ did }: { did?: string }) {
  const text = "No score without a receipt ✱ No score without a receipt ✱ ";
  return (
    <div className="badge" aria-hidden="true">
      <svg className="badge-ring" viewBox="0 0 200 200">
        <defs>
          <path id="badge-circle" d="M100,100 m-82,0 a82,82 0 1,1 164,0 a82,82 0 1,1 -164,0" />
        </defs>
        <text>
          <textPath href="#badge-circle" textLength="510">{text.toUpperCase()}</textPath>
        </text>
      </svg>
      <div className="badge-core">{did ? <Sigil did={did} size={120} /> : null}</div>
    </div>
  );
}

/** Every attack in the lab, and the stage that stopped it. The only marquee on the site. */
export function Ticker() {
  const items = ATTACKS.map((a) => (
    <span key={a.id} className="ticker-item">
      <b>{a.id}</b>
      {a.title}
      <i>Refused at stage {a.stage}</i>
      <span aria-hidden="true">{"✱"}</span>
    </span>
  ));
  return (
    <div className="ticker" aria-label="Ten attacks, ten refusals">
      <div className="ticker-track">
        {items}
        <span aria-hidden="true" style={{ display: "contents" }}>{items}</span>
      </div>
    </div>
  );
}
