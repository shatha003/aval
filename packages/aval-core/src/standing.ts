import type { Attestation } from "./credentials";
import { checkReceipt, counterpartyOf, type InteractionReceipt } from "./receipts";
import { toMillis } from "./util";

export interface StandingParams {
  /** Evidence loses half its weight every N days. */
  halfLifeDays: number;
  /** Tasks at or above this value (USD) carry full weight; smaller ones carry less. */
  valueRefUsd: number;
  /** Max total evidence weight any ONE counterparty can contribute. Kills self-dealing loops. */
  perCounterpartyCap: number;
  defaultedWeight: number;
  disputedWeight: number;
  /** One-sided z for the lower bound (1.645 ≈ 95% one-sided / 90% two-sided). */
  z: number;
  /** A vouch is worth at most this many pseudo-observations, scaled by voucher quality. */
  vouchPseudoObs: number;
  /** All vouches together can add at most this much evidence. */
  vouchCap: number;
  /** A voucher needs this many independent counterparties before its vouch counts at all. */
  voucherMinCounterparties: number;
}

export const DEFAULT_PARAMS: StandingParams = {
  halfLifeDays: 90,
  valueRefUsd: 1000,
  perCounterpartyCap: 3,
  defaultedWeight: 1.5,
  disputedWeight: 0.5,
  z: 1.645,
  vouchPseudoObs: 4,
  vouchCap: 6,
  voucherMinCounterparties: 3,
};

export interface EvidenceLine {
  receiptId: string;
  counterparty: string;
  outcome: InteractionReceipt["outcome"];
  /** Weight before the per-counterparty cap. */
  rawWeight: number;
  /** Weight actually counted after the cap. */
  weight: number;
  capped: boolean;
  success: number;
  failure: number;
}

export interface VouchLine {
  attestationId: string;
  voucher: string;
  declaredWeight: number;
  voucherIndependentReceipts: number;
  voucherIndependentCounterparties: number;
  voucherLowerBound: number;
  /** declared × voucher lower bound; 0 when the voucher has no independent history. */
  weight: number;
  pseudoObservations: number;
  counted: boolean;
  note: string;
}

export interface Standing {
  alpha: number;
  beta: number;
  mean: number;
  /** One-sided lower confidence bound. This is the number policy should read. */
  lowerBound: number;
  receiptCount: number;
  distinctCounterparties: number;
  /** Total failure-side evidence from receipts (defaults/disputes). */
  failureWeight: number;
  evidence: EvidenceLine[];
  vouches: VouchLine[];
  vouchBoost: number;
}

interface Raw {
  alpha: number;
  beta: number;
  evidence: EvidenceLine[];
  counterparties: Set<string>;
  failureWeight: number;
}

const DAY = 86_400_000;

function raw(
  holder: string,
  receipts: InteractionReceipt[],
  now: string,
  params: StandingParams,
  exclude: Set<string>,
): Raw {
  const sorted = [...receipts].sort((a, b) => toMillis(a.completedAt) - toMillis(b.completedAt));
  const used = new Map<string, number>();
  const evidence: EvidenceLine[] = [];
  const counterparties = new Set<string>();
  let alpha = 1;
  let beta = 1;
  let failureWeight = 0;

  for (const r of sorted) {
    const cp = counterpartyOf(r, holder);
    if (exclude.has(cp)) continue;
    const ageDays = Math.max(0, (toMillis(now) - toMillis(r.completedAt)) / DAY);
    const decay = Math.pow(0.5, ageDays / params.halfLifeDays);
    const valueW = 0.25 + 0.75 * Math.min(1, r.task.value / params.valueRefUsd);
    const rawWeight = decay * valueW;
    const remaining = Math.max(0, params.perCounterpartyCap - (used.get(cp) ?? 0));
    const weight = Math.min(rawWeight, remaining);
    used.set(cp, (used.get(cp) ?? 0) + weight);
    counterparties.add(cp);

    let success = 0;
    let failure = 0;
    if (r.outcome === "fulfilled") success = weight;
    else if (r.outcome === "defaulted") failure = weight * params.defaultedWeight;
    else failure = weight * params.disputedWeight;
    alpha += success;
    beta += failure;
    failureWeight += failure;
    evidence.push({
      receiptId: r.id,
      counterparty: cp,
      outcome: r.outcome,
      rawWeight,
      weight,
      capped: weight < rawWeight - 1e-9,
      success,
      failure,
    });
  }
  return { alpha, beta, evidence, counterparties, failureWeight };
}

/** Normal approximation to the one-sided lower bound of Beta(alpha, beta). */
export function betaLowerBound(alpha: number, beta: number, z: number): number {
  const n = alpha + beta;
  const mean = alpha / n;
  const sd = Math.sqrt((alpha * beta) / (n * n * (n + 1)));
  return Math.min(1, Math.max(0, mean - z * sd));
}

export interface StandingInputs {
  holder: string;
  /** Receipts already verified at stage 8. */
  receipts: InteractionReceipt[];
  /** Attestations already verified at stages 2-5. */
  attestations: Attestation[];
  now: string;
  directory: (did: string) => InteractionReceipt[];
  params?: StandingParams;
}

export function computeStanding(input: StandingInputs): Standing {
  const params = input.params ?? DEFAULT_PARAMS;
  const { holder, now } = input;
  const own = raw(holder, input.receipts, now, params, new Set());

  // Vouches: one per voucher (best wins), none from the subject itself.
  const byVoucher = new Map<string, Attestation>();
  for (const a of input.attestations) {
    if (a.issuer === holder || a.credentialSubject.id !== holder) continue;
    const prev = byVoucher.get(a.issuer);
    if (!prev || a.credentialSubject.weight > prev.credentialSubject.weight) byVoucher.set(a.issuer, a);
  }
  const voucherSet = new Set(byVoucher.keys());

  const vouches: VouchLine[] = [];
  let boost = 0;
  for (const [voucher, a] of byVoucher) {
    // A voucher's standing is judged WITHOUT the subject and without the other vouchers
    // in this bundle, so a ring of mutual vouchers and mutual trades earns nothing.
    const exclude = new Set<string>([holder, ...[...voucherSet].filter((v) => v !== voucher)]);
    const theirReceipts = input
      .directory(voucher)
      .filter((r) => (r.requester === voucher || r.provider === voucher) && checkReceipt(r).ok);
    const indep = raw(voucher, theirReceipts, now, params, exclude);
    const lb = betaLowerBound(indep.alpha, indep.beta, params.z);
    const declared = Math.min(1, Math.max(0, a.credentialSubject.weight));
    const enough = indep.counterparties.size >= params.voucherMinCounterparties;
    const weight = enough ? declared * lb : 0;
    const pseudo = params.vouchPseudoObs * weight;
    const counted = pseudo > 0;
    if (counted) boost += pseudo;
    vouches.push({
      attestationId: a.id,
      voucher,
      declaredWeight: declared,
      voucherIndependentReceipts: indep.evidence.length,
      voucherIndependentCounterparties: indep.counterparties.size,
      voucherLowerBound: lb,
      weight,
      pseudoObservations: pseudo,
      counted,
      note: enough
        ? "voucher has independent history; vouch weighted by its own lower bound"
        : `voucher has ${indep.counterparties.size} independent counterpart${indep.counterparties.size === 1 ? "y" : "ies"} (needs ${params.voucherMinCounterparties}); vouch weighs nothing`,
    });
  }
  const vouchBoost = Math.min(params.vouchCap, boost);

  const alpha = own.alpha + vouchBoost;
  const beta = own.beta;
  const mean = alpha / (alpha + beta);
  return {
    alpha,
    beta,
    mean,
    lowerBound: betaLowerBound(alpha, beta, params.z),
    receiptCount: input.receipts.length,
    distinctCounterparties: own.counterparties.size,
    failureWeight: own.failureWeight,
    evidence: own.evidence,
    vouches,
    vouchBoost,
  };
}
