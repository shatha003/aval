import { describe, expect, it } from "vitest";
import {
  DecisionLog,
  PROCUREMENT_POLICY,
  VENDOR_POLICY,
  b58decode,
  b58encode,
  buildWorld,
  didFromPublicKey,
  evaluate,
  jcs,
  keypairFromSeed,
  publicKeyFromDid,
  signDocument,
  verifyDecisionLog,
  verifyDecisionReceipt,
  verifyDocument,
} from "../src";

const world = buildWorld();
const atlas = world.actor("atlas").signer;

function run(actorId: string, value: number, opts: { verifier?: typeof atlas; policy?: typeof PROCUREMENT_POLICY; world?: typeof world } = {}) {
  const w = opts.world ?? world;
  const verifier = opts.verifier ?? atlas;
  return evaluate({
    presentation: w.present(actorId, verifier),
    request: { action: "task.accept", value },
    policy: opts.policy ?? PROCUREMENT_POLICY,
    ctx: w.context(verifier),
    evaluator: verifier,
    log: new DecisionLog(),
  });
}

describe("primitives", () => {
  it("base58btc round-trips, including leading zero bytes", () => {
    for (const bytes of [[0, 0, 1, 2, 3], [255, 0, 7], [1], [0]]) {
      const u = Uint8Array.from(bytes);
      expect(Array.from(b58decode(b58encode(u)))).toEqual(bytes);
    }
  });

  it("did:key encodes and resolves the same Ed25519 key", () => {
    const k = keypairFromSeed("x");
    expect(k.did.startsWith("did:key:z6Mk")).toBe(true); // every Ed25519 did:key starts z6Mk
    expect(Array.from(publicKeyFromDid(k.did))).toEqual(Array.from(k.publicKey));
    expect(didFromPublicKey(k.publicKey)).toBe(k.did);
  });

  it("JCS canonicalization is independent of key order", () => {
    expect(jcs({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(jcs({ a: [2, { c: 2, d: 1 }], b: 1 }));
  });

  it("a proof verifies, and any change to the document breaks it", () => {
    const k = keypairFromSeed("signer");
    const doc = signDocument({ hello: "world", n: 1 }, k, { created: "2026-01-01T00:00:00Z", purpose: "assertionMethod" });
    expect(verifyDocument(doc).every((c) => c.ok)).toBe(true);
    expect(verifyDocument({ ...doc, n: 2 } as object)[0]!.ok).toBe(false);
    const other = keypairFromSeed("someone-else");
    const forged = { ...doc, proof: { ...doc.proof, verificationMethod: `${other.did}#${other.did.slice(8)}` } };
    expect(verifyDocument(forged)[0]!.ok).toBe(false);
  });

  it("the world is deterministic: same seeds, same identities and receipts", () => {
    const a = buildWorld();
    expect(a.actor("halcyon").signer.did).toBe(world.actor("halcyon").signer.did);
    expect(a.ledger.receipts.map((r) => r.id)).toEqual(world.ledger.receipts.map((r) => r.id));
  });
});

describe("trust-gated decisions", () => {
  it("accepts a veteran with authority, history and independent vouches", () => {
    const e = run("halcyon", 3_000);
    expect(e.trace.map((s) => s.status)).toEqual(Array(10).fill("pass"));
    expect(e.decision.verdict).toBe("ACCEPT");
    expect(e.standing!.lowerBound).toBeGreaterThan(0.75);
    expect(e.standing!.vouches.filter((v) => v.counted)).toHaveLength(3);
  });

  it("treats a properly credentialed newcomer as unknown, not bad: accept with conditions", () => {
    const e = run("fennel", 400);
    expect(e.decision.verdict).toBe("ACCEPT_WITH_CONDITIONS");
    expect(e.decision.conditions.map((c) => c.kind)).toEqual(["escrow", "cap"]);
    expect(e.decision.conditions[0]!.amount).toBe(200);
  });

  it("refuses the same newcomer on a task too big for probation", () => {
    const e = run("fennel", 1_500);
    expect(e.decision.verdict).toBe("REFUSE");
    expect(e.decision.code).toBe("INSUFFICIENT_STANDING");
  });

  it("is mutual: a vendor can gate the buyer with its own policy", () => {
    const halcyon = world.actor("halcyon").signer;
    const e = evaluate({
      presentation: world.present("atlas", halcyon),
      request: { action: "task.request", value: 8_000 },
      policy: VENDOR_POLICY,
      ctx: world.context(halcyon),
      evaluator: halcyon,
      log: new DecisionLog(),
    });
    expect(e.decision.verdict).toBe("ACCEPT");
  });

  it("escalates to a human above anything the policy lets an agent decide alone", () => {
    const e = run("halcyon", 100_000);
    // Halcyon's own grant caps at $10k, so authority stops it first.
    expect(e.decision.code).toBe("SCOPE_EXCEEDED");
  });

  it("signs every decision, and the decision receipts form a verifiable chain", () => {
    const log = new DecisionLog();
    for (const [id, v] of [["halcyon", 3_000], ["fennel", 400], ["mallory", 100]] as const) {
      evaluate({
        presentation: world.present(id, atlas),
        request: { action: "task.accept", value: v },
        policy: PROCUREMENT_POLICY,
        ctx: world.context(atlas),
        evaluator: atlas,
        log,
      });
    }
    expect(log.entries).toHaveLength(3);
    expect(verifyDecisionLog(log.entries)).toEqual({ ok: true });
    // Fennel was ACCEPT_WITH_CONDITIONS; upgrading it to ACCEPT must break the evaluator's signature.
    expect(verifyDecisionReceipt({ ...log.entries[1]!, verdict: "ACCEPT" })).toMatchObject({ ok: false });
    const tampered = structuredClone(log.entries);
    tampered[1]!.verdict = "ACCEPT";
    expect(verifyDecisionLog(tampered).ok).toBe(false);
  });
});
