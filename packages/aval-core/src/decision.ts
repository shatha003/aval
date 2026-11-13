import type { Signer } from "./did";
import { VC_CONTEXT } from "./credentials";
import { applyPolicy, type Condition, type Policy, type PolicyDecision, type Reason, type Request, type Verdict } from "./policy";
import type { Presentation } from "./presentation";
import { signDocument, verifyDocument, type WithProof } from "./sign";
import { computeStanding, type Standing, type StandingParams } from "./standing";
import { contentId } from "./util";
import { STAGE_NAMES, verifyPresentation, type StageResult, type VerificationReport, type VerifierContext } from "./verify";

export interface DecisionReceiptUnsigned {
  "@context": string[];
  id: string;
  type: "DecisionReceipt";
  evaluator: string;
  /** DID the presenter claimed. Present even when the claim was refused. */
  subject: string;
  request: Request;
  policyId: string;
  verdict: Verdict;
  code: string;
  reasons: Reason[];
  conditions: Condition[];
  trace: Array<Pick<StageResult, "stage" | "name" | "status" | "code">>;
  decidedAt: string;
  /** Hash chain over this evaluator's decisions. */
  prev: string | null;
}
export type DecisionReceipt = WithProof<DecisionReceiptUnsigned>;

export class DecisionLog {
  readonly entries: DecisionReceipt[] = [];
  head(): string | null {
    return this.entries.at(-1)?.id ?? null;
  }
  push(r: DecisionReceipt) {
    this.entries.push(r);
  }
}

export interface Evaluation {
  /** All ten stages, in order. */
  trace: StageResult[];
  verification: VerificationReport;
  standing?: Standing;
  decision: PolicyDecision;
  receipt: DecisionReceipt;
}

const pad = (stage: number): StageResult => ({
  stage,
  name: STAGE_NAMES[stage - 1]!,
  status: "skipped",
  code: "SKIPPED",
  detail: "not reached",
  evidence: [],
});

export function evaluate(args: {
  presentation: Presentation;
  request: Request;
  policy: Policy;
  ctx: VerifierContext;
  evaluator: Signer;
  log: DecisionLog;
  params?: StandingParams;
}): Evaluation {
  const { presentation, request, policy, ctx, evaluator, log } = args;
  const verification = verifyPresentation(presentation, ctx);

  let standing: Standing | undefined;
  let decision: PolicyDecision;
  const trace: StageResult[] = [...verification.stages];

  if (!verification.ok || !verification.facts) {
    const f = verification.failedAt!;
    decision = {
      verdict: "REFUSE",
      code: f.code,
      reasons: [{ code: f.code, polarity: "against", evidence: f.evidence, message: `Stage ${f.stage} (${f.name}): ${f.detail}.` }],
      conditions: [],
    };
    trace.push(pad(9), pad(10));
  } else {
    const facts = verification.facts;
    standing = computeStanding({
      holder: facts.holder,
      receipts: facts.receipts,
      attestations: facts.attestations.accepted,
      now: ctx.now,
      directory: ctx.directory,
      params: args.params,
    });
    const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
    trace.push({
      stage: 9,
      name: STAGE_NAMES[8],
      status: "pass",
      code: "OK",
      detail: `mean ${pct(standing.mean)}, lower bound ${pct(standing.lowerBound)} from ${standing.receiptCount} receipt(s) across ${standing.distinctCounterparties} counterpart${standing.distinctCounterparties === 1 ? "y" : "ies"}; vouches add ${standing.vouchBoost.toFixed(2)}`,
      evidence: standing.evidence.slice(0, 8).map((e) => e.receiptId),
    });
    decision = applyPolicy(policy, facts, standing, request);
    trace.push({
      stage: 10,
      name: STAGE_NAMES[9],
      status: decision.verdict === "REFUSE" ? "fail" : "pass",
      code: decision.code,
      detail: decision.reasons.map((r) => r.message).join(" "),
      evidence: decision.reasons.flatMap((r) => r.evidence).slice(0, 8),
    });
  }

  const unsigned = {
    "@context": [VC_CONTEXT],
    type: "DecisionReceipt" as const,
    evaluator: evaluator.did,
    subject: presentation?.holder ?? "unknown",
    request,
    policyId: policy.id,
    verdict: decision.verdict,
    code: decision.code,
    reasons: decision.reasons,
    conditions: decision.conditions,
    trace: trace.map(({ stage, name, status, code }) => ({ stage, name, status, code })),
    decidedAt: ctx.now,
    prev: log.head(),
  };
  const id = contentId("decision", unsigned);
  const receipt = signDocument({ id, ...unsigned }, evaluator, { created: ctx.now, purpose: "assertionMethod" }) as DecisionReceipt;
  log.push(receipt);
  return { trace, verification, standing, decision, receipt };
}

export type DecisionCheck = { ok: true } | { ok: false; code: string; detail: string };

/** Anyone can re-check a decision: id matches content, evaluator's signature holds. */
export function verifyDecisionReceipt(r: DecisionReceipt): DecisionCheck {
  try {
    if (r.type !== "DecisionReceipt") return { ok: false, code: "MALFORMED", detail: "not a decision receipt" };
    if (contentId("decision", r) !== r.id) return { ok: false, code: "ID_MISMATCH", detail: "content does not match its id" };
    const proofs = verifyDocument(r);
    if (proofs.length !== 1 || !proofs[0]!.ok || proofs[0]!.signer !== r.evaluator) {
      return { ok: false, code: "SIG_INVALID", detail: "evaluator signature does not verify" };
    }
    return { ok: true };
  } catch {
    return { ok: false, code: "MALFORMED", detail: "could not parse" };
  }
}

export function verifyDecisionLog(entries: DecisionReceipt[]): DecisionCheck {
  let prev: string | null = null;
  for (const e of entries) {
    const c = verifyDecisionReceipt(e);
    if (!c.ok) return c;
    if (e.prev !== prev) return { ok: false, code: "LOG_BROKEN", detail: "decision log chain is broken" };
    prev = e.id;
  }
  return { ok: true };
}
