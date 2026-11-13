import { checkReceipt, contentId, verifyDocument, type InteractionReceipt } from "@aval/core";

export interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

export interface Inspection {
  kind: string;
  summary: string;
  checks: Check[];
  ok: boolean;
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const sigCheck = (doc: Json, signerDid: string, label: string, nameOf: (d: string) => string): Check => {
  const proofs = verifyDocument(doc);
  const mine = proofs.find((p) => p.signer === signerDid);
  if (!mine) return { label, ok: false, detail: `no proof from ${nameOf(signerDid)}` };
  return {
    label,
    ok: mine.ok,
    detail: mine.ok ? `Ed25519 signature by ${nameOf(signerDid)} verifies over the canonical bytes (eddsa-jcs-2022)` : `signature does not verify (${mine.code}): the bytes were changed after signing`,
  };
};

/** Independently re-check any AVAL document. Runs entirely in the browser. */
export function inspect(input: unknown, nameOf: (did: string) => string): Inspection {
  const doc = input as Json;
  if (!doc || typeof doc !== "object") throw new Error("Not a JSON object");
  const types: string[] = Array.isArray(doc.type) ? doc.type : [doc.type];
  const finish = (kind: string, summary: string, checks: Check[]): Inspection => ({ kind, summary, checks, ok: checks.every((c) => c.ok) });

  if (types.includes("DecisionReceipt")) {
    return finish("Decision receipt", `${String(doc.verdict).replace(/_/g, " ")} · ${nameOf(doc.evaluator)} evaluating ${nameOf(doc.subject)}`, [
      { label: "Content matches its id", ok: contentId("decision", doc) === doc.id, detail: "the id is a hash of everything the evaluator decided, including verdict, reasons and conditions" },
      sigCheck(doc, doc.evaluator, "Signed by the evaluator", nameOf),
    ]);
  }
  if (types.includes("InteractionReceipt")) {
    const r = checkReceipt(doc as InteractionReceipt);
    const proofs = verifyDocument(doc);
    const by = (d: string) => proofs.find((p) => p.signer === d);
    return finish("Interaction receipt", `${nameOf(doc.requester)} ↔ ${nameOf(doc.provider)} · $${doc.task?.value} · ${doc.outcome}`, [
      { label: "Two distinct parties", ok: doc.requester !== doc.provider, detail: "an agent cannot be both sides of its own history" },
      { label: "Content matches its id", ok: contentId("receipt", doc) === doc.id, detail: "task, value, outcome and chain pointers are all inside the hash" },
      { label: `Signed by ${nameOf(doc.requester)}`, ok: !!by(doc.requester)?.ok, detail: by(doc.requester)?.ok ? "valid" : "missing or invalid" },
      { label: `Signed by ${nameOf(doc.provider)}`, ok: !!by(doc.provider)?.ok, detail: by(doc.provider)?.ok ? "valid" : "missing or invalid" },
      { label: "Core verdict", ok: r.ok, detail: r.ok ? "co-signed by both parties" : `${r.code}: ${r.detail}` },
    ]);
  }
  if (types.includes("AuthorityGrant") || types.includes("Attestation")) {
    const prefix = types.includes("AuthorityGrant") ? "grant" : "attestation";
    const s = doc.credentialSubject ?? {};
    const summary =
      prefix === "grant"
        ? `${nameOf(doc.issuer)} authorises ${nameOf(s.id)}: ${(s.scopes ?? []).map((x: Json) => `${x.action}${x.maxValue !== undefined ? ` ≤ $${x.maxValue}` : ""}`).join(", ")}`
        : `${nameOf(doc.issuer)} vouches for ${nameOf(s.id)} (weight ${s.weight})`;
    return finish(prefix === "grant" ? "Authority grant" : "Attestation", summary, [
      { label: "Content matches its id", ok: contentId(prefix, doc) === doc.id, detail: "scopes, caps, expiry and delegation depth are inside the hash" },
      sigCheck(doc, doc.issuer, "Signed by the issuer", nameOf),
    ]);
  }
  if (types.includes("AvalRevocationList")) {
    return finish("Revocation list", `${nameOf(doc.issuer)} · ${doc.revoked?.length ?? 0} revoked · issued ${doc.issuedAt}`, [
      sigCheck(doc, doc.issuer, "Signed by the issuer", nameOf),
    ]);
  }
  if (types.includes("VerifiablePresentation")) {
    return finish("Presentation", `${nameOf(doc.holder)} presenting ${doc.authorityChain?.length ?? 0} grant(s), ${doc.receipts?.length ?? 0} receipt(s)`, [
      sigCheck(doc, doc.holder, "Signed by the holder", nameOf),
    ]);
  }
  throw new Error("Unrecognised document type");
}

/** Change one meaningful field, the way an attacker would. Returns what was changed. */
export function tamper(input: unknown): { doc: unknown; note: string } {
  const doc = structuredClone(input) as Json;
  const types: string[] = Array.isArray(doc.type) ? doc.type : [doc.type];
  if (types.includes("DecisionReceipt")) {
    const from = doc.verdict;
    doc.verdict = from === "ACCEPT" ? "REFUSE" : "ACCEPT";
    return { doc, note: `verdict: ${from} → ${doc.verdict}` };
  }
  if (types.includes("InteractionReceipt")) {
    const from = doc.task.value;
    doc.task.value = from * 10;
    return { doc, note: `task.value: ${from} → ${doc.task.value}` };
  }
  if (types.includes("AuthorityGrant")) {
    const s = doc.credentialSubject.scopes[0];
    const from = s.maxValue;
    s.maxValue = (from ?? 1000) * 100;
    return { doc, note: `scopes[0].maxValue: ${from ?? "none"} → ${s.maxValue}` };
  }
  if (types.includes("Attestation")) {
    const from = doc.credentialSubject.weight;
    doc.credentialSubject.weight = from >= 0.99 ? 0.1 : 1;
    return { doc, note: `weight: ${from} → ${doc.credentialSubject.weight}` };
  }
  if (types.includes("AvalRevocationList")) {
    // The classic: re-date an old list so it passes the freshness check.
    const from = doc.issuedAt;
    doc.issuedAt = new Date(Date.parse(from) + 3_600_000).toISOString();
    return { doc, note: `issuedAt: ${from} → ${doc.issuedAt} (making a stale list look fresh)` };
  }
  doc.holder = `${doc.holder}x`;
  return { doc, note: "holder changed" };
}
