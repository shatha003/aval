import type { Verdict } from "@aval/core";

const TEXT: Record<Verdict, { word: string; tone: "accept" | "refuse" | "cond" }> = {
  ACCEPT: { word: "Admitted", tone: "accept" },
  ACCEPT_WITH_CONDITIONS: { word: "Admitted on conditions", tone: "cond" },
  ESCALATE: { word: "Referred to a human", tone: "cond" },
  REFUSE: { word: "Refused", tone: "refuse" },
};

export const toneOf = (v: Verdict) => TEXT[v].tone;

/** An ink stamp. `key`ing it on the receipt id replays the thump each time. */
export function Stamp({ verdict, date }: { verdict: Verdict; date: string }) {
  const { word, tone } = TEXT[verdict];
  return (
    <div className={`stamp stamp-${tone}`} role="img" aria-label={`Verdict: ${word}`}>
      <div className="stamp-inner">
        <span className="stamp-word">{word}</span>
        <span className="stamp-date">{date}</span>
      </div>
    </div>
  );
}
