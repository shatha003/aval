import { actionCovers } from "./credentials";
import type { Standing } from "./standing";
import type { VerifiedFacts } from "./verify";

export type Verdict = "ACCEPT" | "ACCEPT_WITH_CONDITIONS" | "ESCALATE" | "REFUSE";

export interface Tier {
  /** Applies to tasks up to this value (USD). */
  upTo: number;
  minLowerBound: number;
  minCounterparties: number;
}

/**
 * A policy is the verifier's own rulebook. It is data, so it can be shown on screen,
 * versioned, and signed into every decision it produces.
 */
export interface Policy {
  id: string;
  label: string;
  /** Action this policy governs, e.g. "task.accept". */
  action: string;
  tiers: Tier[];
  /** For counterparties with thin but clean history: accept small tasks under conditions. */
  probation: { maxValue: number; escrowPct: number };
}

export interface Request {
  action: string;
  value: number;
  description?: string;
}

export interface Reason {
  code: string;
  message: string;
  evidence: string[];
  /** "for" reasons support the verdict, "against" reasons are why it was withheld. */
  polarity: "for" | "against";
}

export interface Condition {
  kind: "escrow" | "cap" | "human-approval";
  amount?: number;
  note: string;
}

export interface PolicyDecision {
  verdict: Verdict;
  /** The single code that decided it. */
  code: string;
  reasons: Reason[];
  conditions: Condition[];
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

export function applyPolicy(policy: Policy, facts: VerifiedFacts, standing: Standing, request: Request): PolicyDecision {
  const reasons: Reason[] = [];
  const authEvidence = facts.authority.chain;

  // 1. Authority
  const covering = facts.authority.scopes.filter((s) => actionCovers(s.action, request.action));
  if (covering.length === 0) {
    reasons.push({ code: "ACTION_NOT_AUTHORISED", polarity: "against", evidence: authEvidence, message: `Holder has no authority for "${request.action}".` });
    return { verdict: "REFUSE", code: "ACTION_NOT_AUTHORISED", reasons, conditions: [] };
  }
  const allowed = covering.some((s) => s.maxValue === undefined || request.value <= s.maxValue);
  if (!allowed) {
    const cap = Math.max(...covering.map((s) => s.maxValue ?? Infinity));
    reasons.push({ code: "SCOPE_EXCEEDED", polarity: "against", evidence: authEvidence, message: `Task is ${usd(request.value)} but the holder's signed authority is capped at ${usd(cap)}.` });
    return { verdict: "REFUSE", code: "SCOPE_EXCEEDED", reasons, conditions: [] };
  }
  reasons.push({ code: "AUTHORITY_OK", polarity: "for", evidence: authEvidence, message: `Authority chain of ${facts.authority.depth} grant(s) covers ${usd(request.value)}.` });

  // 2. Tier for this value
  const tier = [...policy.tiers].sort((a, b) => a.upTo - b.upTo).find((t) => request.value <= t.upTo);
  if (!tier) {
    reasons.push({ code: "VALUE_ABOVE_POLICY", polarity: "against", evidence: [], message: `${usd(request.value)} is above anything this policy lets an agent decide alone.` });
    return {
      verdict: "ESCALATE",
      code: "VALUE_ABOVE_POLICY",
      reasons,
      conditions: [{ kind: "human-approval", note: "A named human must approve before work starts." }],
    };
  }

  const topEvidence = [...standing.evidence].sort((a, b) => b.weight - a.weight).slice(0, 5).map((e) => e.receiptId);
  const lbOk = standing.lowerBound >= tier.minLowerBound;
  const cpOk = standing.distinctCounterparties >= tier.minCounterparties;
  const summary = `lower bound ${pct(standing.lowerBound)} (needs ${pct(tier.minLowerBound)}), ${standing.distinctCounterparties} independent counterpart${standing.distinctCounterparties === 1 ? "y" : "ies"} (needs ${tier.minCounterparties})`;

  if (lbOk && cpOk) {
    reasons.push({ code: "STANDING_OK", polarity: "for", evidence: topEvidence, message: `Standing meets the tier for tasks up to ${usd(tier.upTo)}: ${summary}.` });
    return { verdict: "ACCEPT", code: "STANDING_OK", reasons, conditions: [] };
  }

  // 3. Not enough standing for this tier.
  const vouchNote = standing.vouches.filter((v) => !v.counted && v.declaredWeight > 0);
  if (vouchNote.length) {
    reasons.push({
      code: "VOUCHES_WEIGH_NOTHING",
      polarity: "against",
      evidence: vouchNote.map((v) => v.attestationId),
      message: `${vouchNote.length} vouch(es) carry no weight: ${vouchNote[0]!.note}.`,
    });
  }

  const clean = standing.failureWeight < 0.5;
  if (clean && request.value <= policy.probation.maxValue) {
    reasons.push({ code: "UNPROVEN_STANDING", polarity: "against", evidence: topEvidence, message: `Standing is thin (${summary}) but nothing counts against the holder.` });
    return {
      verdict: "ACCEPT_WITH_CONDITIONS",
      code: "UNPROVEN_STANDING",
      reasons,
      conditions: [
        { kind: "escrow", amount: Math.round(request.value * policy.probation.escrowPct), note: `${pct(policy.probation.escrowPct)} held until delivery is confirmed.` },
        { kind: "cap", amount: policy.probation.maxValue, note: `Probation limit: ${usd(policy.probation.maxValue)} per task.` },
      ],
    };
  }

  const code = clean ? "INSUFFICIENT_STANDING" : "POOR_HISTORY";
  reasons.push({
    code,
    polarity: "against",
    evidence: topEvidence,
    message: clean
      ? `Standing is too thin for a ${usd(request.value)} task: ${summary}.`
      : `History includes defaults or disputes; ${summary}.`,
  });
  return { verdict: "REFUSE", code, reasons, conditions: [] };
}

/** The vendor's side of the same marketplace: whom will I take work FROM? */
export const VENDOR_POLICY: Policy = {
  id: "vendor.intake.v1",
  label: "Vendor intake",
  action: "task.request",
  tiers: [
    { upTo: 5_000, minLowerBound: 0.6, minCounterparties: 4 },
    { upTo: 25_000, minLowerBound: 0.8, minCounterparties: 6 },
  ],
  probation: { maxValue: 1_000, escrowPct: 0.5 },
};

/** A sensible default policy for the demo marketplace. */
export const PROCUREMENT_POLICY: Policy = {
  id: "procurement.v1",
  label: "Procurement desk",
  action: "task.accept",
  tiers: [
    { upTo: 500, minLowerBound: 0.5, minCounterparties: 3 },
    { upTo: 5_000, minLowerBound: 0.75, minCounterparties: 5 },
    { upTo: 25_000, minLowerBound: 0.88, minCounterparties: 8 },
  ],
  probation: { maxValue: 500, escrowPct: 0.5 },
};
