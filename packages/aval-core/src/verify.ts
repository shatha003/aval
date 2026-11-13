import type { Attestation, AuthorityGrant, Scope } from "./credentials";
import { scopesAttenuate } from "./credentials";
import { isResolvableDid } from "./did";
import type { ChallengeStore, Presentation } from "./presentation";
import { checkChain, checkReceipt, type InteractionReceipt } from "./receipts";
import { checkRevocation, type RevocationList } from "./revocation";
import { proofList, verifyDocument } from "./sign";
import { contentId, toMillis } from "./util";

export const STAGE_NAMES = [
  "Resolve identity",
  "Verify proofs",
  "Trust anchor",
  "Validity window",
  "Revocation",
  "Attenuation",
  "Holder binding",
  "History integrity",
  "Standing",
  "Policy",
] as const;

export type StageStatus = "pass" | "fail" | "skipped";

export interface StageResult {
  stage: number; // 1-based
  name: string;
  status: StageStatus;
  code: string;
  detail: string;
  /** Ids of the objects this stage looked at (credentials, receipts, DIDs). */
  evidence: string[];
}

export interface VerifierContext {
  /** The verifier's own DID; presentations must be addressed to it. */
  did: string;
  /** Issuers this verifier accepts as roots of authority. */
  anchors: string[];
  now: string;
  revocation: (issuer: string) => RevocationList | undefined;
  maxRevocationAgeSec: number;
  challenges: ChallengeStore;
  /** Public receipt directory, used to judge vouchers' independent history. */
  directory: (did: string) => InteractionReceipt[];
}

export interface RejectedAttestation {
  id: string;
  issuer: string;
  code: string;
  detail: string;
}

export interface VerifiedFacts {
  holder: string;
  authority: {
    scopes: Scope[];
    chain: string[];
    anchor: string;
    expiresAt: string;
    depth: number;
  };
  receipts: InteractionReceipt[]; // ordered along the holder's chain
  attestations: { accepted: Attestation[]; rejected: RejectedAttestation[] };
}

export interface VerificationReport {
  stages: StageResult[]; // always 8 entries (stages 1-8)
  ok: boolean;
  failedAt?: StageResult;
  facts?: VerifiedFacts;
}

class StageFail extends Error {
  constructor(
    public code: string,
    public detail: string,
    public evidence: string[] = [],
  ) {
    super(detail);
  }
}

const short = (s: string) => (s.length > 22 ? `${s.slice(0, 16)}…${s.slice(-4)}` : s);
const MAX_CHAIN = 8;
const MAX_RECEIPTS = 500;
const MAX_ATTESTATIONS = 50;

interface State {
  chain: AuthorityGrant[];
  attestations: Attestation[];
  rejected: RejectedAttestation[];
  ordered: InteractionReceipt[];
}

export function verifyPresentation(p: Presentation, ctx: VerifierContext): VerificationReport {
  const state: State = { chain: [], attestations: [], rejected: [], ordered: [] };
  const rejectAtt = (a: Attestation, code: string, detail: string) =>
    state.rejected.push({ id: a?.id ?? "?", issuer: a?.issuer ?? "?", code, detail });
  const dropAtt = (keep: (a: Attestation) => { code: string; detail: string } | null) => {
    state.attestations = state.attestations.filter((a) => {
      const bad = keep(a);
      if (bad) rejectAtt(a, bad.code, bad.detail);
      return !bad;
    });
  };

  const steps: Array<() => { detail: string; evidence?: string[] }> = [
    // 1. Resolve identity
    () => {
      if (!p || p.type !== "VerifiablePresentation") throw new StageFail("MALFORMED", "not a verifiable presentation");
      if (!Array.isArray(p.authorityChain) || p.authorityChain.length === 0) {
        throw new StageFail("NO_AUTHORITY", "presentation carries no authority chain");
      }
      if (p.authorityChain.length > MAX_CHAIN) throw new StageFail("CHAIN_TOO_LONG", `chain exceeds ${MAX_CHAIN} links`);
      if ((p.receipts?.length ?? 0) > MAX_RECEIPTS) throw new StageFail("TOO_MANY_RECEIPTS", "receipt bundle too large");
      if ((p.attestations?.length ?? 0) > MAX_ATTESTATIONS) throw new StageFail("TOO_MANY_ATTESTATIONS", "attestation bundle too large");
      const dids = new Set<string>([p.holder]);
      for (const c of p.authorityChain) {
        dids.add(c.issuer);
        dids.add(c.credentialSubject?.id);
      }
      for (const r of p.receipts ?? []) {
        dids.add(r.requester);
        dids.add(r.provider);
      }
      for (const d of dids) {
        if (!isResolvableDid(d)) throw new StageFail("UNRESOLVABLE_DID", `cannot resolve ${short(String(d))}`, [String(d)]);
      }
      state.chain = p.authorityChain;
      state.attestations = [...(p.attestations ?? [])];
      return { detail: `${dids.size} ${dids.size === 1 ? "identity" : "identities"} resolved to Ed25519 keys`, evidence: [...dids] };
    },

    // 2. Verify proofs (credentials)
    () => {
      for (const c of state.chain) {
        const proofs = verifyDocument(c);
        const okProof = proofs.length === 1 && proofs[0]!.ok && proofs[0]!.signer === c.issuer;
        if (!okProof) {
          throw new StageFail("CREDENTIAL_SIG_INVALID", `signature on ${short(c.id)} does not verify against its issuer`, [c.id]);
        }
        if (contentId("grant", c) !== c.id) {
          throw new StageFail("CREDENTIAL_ID_MISMATCH", `${short(c.id)} does not match its content hash`, [c.id]);
        }
      }
      dropAtt((a) => {
        const proofs = verifyDocument(a);
        if (!(proofs.length === 1 && proofs[0]!.ok && proofs[0]!.signer === a.issuer && contentId("attestation", a) === a.id)) {
          return { code: "ATTESTATION_SIG_INVALID", detail: "vouch signature does not verify" };
        }
        return null;
      });
      return {
        detail: `${state.chain.length} grant(s) verified; ${state.attestations.length} vouch(es) verified, ${state.rejected.length} rejected`,
        evidence: state.chain.map((c) => c.id),
      };
    },

    // 3. Trust anchor
    () => {
      const chain = state.chain;
      for (let i = 0; i < chain.length - 1; i++) {
        const child = chain[i]!;
        const parent = chain[i + 1]!;
        if (child.credentialSubject.parent !== parent.id) {
          throw new StageFail("CHAIN_BROKEN", `${short(child.id)} does not reference ${short(parent.id)} as its parent`, [child.id, parent.id]);
        }
        if (child.issuer !== parent.credentialSubject.id) {
          throw new StageFail("CHAIN_BROKEN", "delegator is not the holder of the parent grant", [child.id, parent.id]);
        }
      }
      const root = chain[chain.length - 1]!;
      if (root.credentialSubject.parent !== null) {
        throw new StageFail("CHAIN_BROKEN", "chain ends in a grant that still points to a parent", [root.id]);
      }
      if (!ctx.anchors.includes(root.issuer)) {
        throw new StageFail("ISSUER_NOT_TRUSTED", `root issuer ${short(root.issuer)} is not a trust anchor of this verifier`, [root.id, root.issuer]);
      }
      return { detail: `chain of ${chain.length} reaches anchor ${short(root.issuer)}`, evidence: chain.map((c) => c.id) };
    },

    // 4. Validity window
    () => {
      const now = toMillis(ctx.now);
      const bad = (c: { validFrom: string; validUntil: string }) =>
        now < toMillis(c.validFrom) ? "NOT_YET_VALID" : now > toMillis(c.validUntil) ? "EXPIRED" : null;
      for (const c of state.chain) {
        const code = bad(c);
        if (code) throw new StageFail(code, `${short(c.id)} is ${code === "EXPIRED" ? "expired" : "not yet valid"}`, [c.id]);
      }
      dropAtt((a) => {
        const code = bad(a);
        return code ? { code, detail: "vouch outside its validity window" } : null;
      });
      return { detail: "all credentials inside their validity window", evidence: state.chain.map((c) => c.id) };
    },

    // 5. Revocation (fail closed)
    () => {
      const opts = { now: ctx.now, maxAgeSec: ctx.maxRevocationAgeSec };
      for (const c of state.chain) {
        const r = checkRevocation({ credentialId: c.id, issuer: c.issuer, list: ctx.revocation(c.issuer), ...opts });
        if (!r.ok) throw new StageFail(r.code, `${short(c.id)}: ${r.detail}`, [c.id, c.issuer]);
      }
      dropAtt((a) => {
        const r = checkRevocation({ credentialId: a.id, issuer: a.issuer, list: ctx.revocation(a.issuer), ...opts });
        return r.ok ? null : { code: r.code, detail: r.detail };
      });
      return { detail: `${state.chain.length} grant(s) checked against fresh issuer lists (max age ${ctx.maxRevocationAgeSec}s)`, evidence: state.chain.map((c) => c.id) };
    },

    // 6. Attenuation
    () => {
      const chain = state.chain;
      for (let i = 0; i < chain.length - 1; i++) {
        const child = chain[i]!;
        const parent = chain[i + 1]!;
        const cs = child.credentialSubject;
        const ps = parent.credentialSubject;
        const fail = (detail: string) => {
          throw new StageFail("DELEGATION_ESCALATION", detail, [child.id, parent.id]);
        };
        if (ps.remainingDepth < 1) fail("parent grant does not permit further delegation");
        if (cs.remainingDepth >= ps.remainingDepth) fail("child grant may delegate more deeply than its parent allows");
        if (!scopesAttenuate(ps.scopes, cs.scopes)) fail("child grant is broader than the parent grant that authorised it");
        if (toMillis(child.validUntil) > toMillis(parent.validUntil)) fail("child grant outlives its parent");
      }
      return { detail: chain.length > 1 ? `${chain.length - 1} delegation(s) only narrow authority` : "root grant, nothing to attenuate", evidence: chain.map((c) => c.id) };
    },

    // 7. Holder binding
    () => {
      const proofs = proofList(p);
      if (proofs.length !== 1) throw new StageFail("BINDING_MISSING", "presentation must carry exactly one holder proof");
      const proof = proofs[0]!;
      if (proof.proofPurpose !== "authentication") throw new StageFail("BINDING_PURPOSE", "proof is not an authentication proof");
      const signer = proof.verificationMethod.split("#")[0];
      if (signer !== p.holder) {
        throw new StageFail("PROOF_SIGNER_MISMATCH", `presentation claims holder ${short(p.holder)} but is signed by ${short(String(signer))}`, [p.holder, String(signer)]);
      }
      if (state.chain[0]!.credentialSubject.id !== p.holder) {
        throw new StageFail("HOLDER_MISMATCH", `grant was issued to ${short(state.chain[0]!.credentialSubject.id)}, not to the presenter ${short(p.holder)}`, [state.chain[0]!.id, p.holder]);
      }
      const check = verifyDocument(p)[0]!;
      if (!check.ok) throw new StageFail("BINDING_SIG_INVALID", "holder signature over the presentation does not verify", [p.holder]);
      if (proof.domain !== ctx.did) throw new StageFail("AUDIENCE_MISMATCH", "presentation is addressed to a different verifier", [String(proof.domain)]);
      const res = ctx.challenges.consume(proof.challenge, ctx.did, ctx.now);
      if (res !== "ok") {
        const map = {
          unknown: "CHALLENGE_UNKNOWN",
          expired: "CHALLENGE_EXPIRED",
          replayed: "CHALLENGE_REPLAYED",
          "wrong-audience": "AUDIENCE_MISMATCH",
        } as const;
        throw new StageFail(map[res], `challenge ${res}`, [String(proof.challenge)]);
      }
      return { detail: `holder proved control of its key against fresh nonce ${short(proof.challenge ?? "")}`, evidence: [p.holder] };
    },

    // 8. History integrity
    () => {
      const receipts = p.receipts ?? [];
      for (const r of receipts) {
        const res = checkReceipt(r);
        if (!res.ok) throw new StageFail(res.code, res.detail, [r?.id ?? "?"]);
        if (r.requester !== p.holder && r.provider !== p.holder) {
          throw new StageFail("RECEIPT_NOT_HOLDERS", "receipt does not involve the presenter", [r.id]);
        }
      }
      const chain = checkChain(p.holder, receipts);
      if (!chain.ok) throw new StageFail(chain.code, chain.detail, receipts.map((r) => r.id));
      state.ordered = chain.ordered;
      return {
        detail: receipts.length ? `${receipts.length} receipt(s) co-signed and chained without gaps` : "no history presented",
        evidence: receipts.map((r) => r.id),
      };
    },
  ];

  const stages: StageResult[] = [];
  let failedAt: StageResult | undefined;
  steps.forEach((step, i) => {
    const base = { stage: i + 1, name: STAGE_NAMES[i]! };
    if (failedAt) {
      stages.push({ ...base, status: "skipped", code: "SKIPPED", detail: "not reached", evidence: [] });
      return;
    }
    try {
      const out = step();
      stages.push({ ...base, status: "pass", code: "OK", detail: out.detail, evidence: out.evidence ?? [] });
    } catch (e) {
      const f =
        e instanceof StageFail
          ? e
          : new StageFail("MALFORMED", "presentation could not be processed");
      failedAt = { ...base, status: "fail", code: f.code, detail: f.detail, evidence: f.evidence };
      stages.push(failedAt);
    }
  });

  if (failedAt) return { stages, ok: false, failedAt };

  const chain = state.chain;
  const root = chain[chain.length - 1]!;
  const facts: VerifiedFacts = {
    holder: p.holder,
    authority: {
      scopes: chain[0]!.credentialSubject.scopes,
      chain: chain.map((c) => c.id),
      anchor: root.issuer,
      expiresAt: new Date(Math.min(...chain.map((c) => toMillis(c.validUntil)))).toISOString(),
      depth: chain.length,
    },
    receipts: state.ordered,
    attestations: { accepted: state.attestations, rejected: state.rejected },
  };
  return { stages, ok: true, facts };
}
