import { ed25519 } from "@noble/curves/ed25519";
import {
  didFromVerificationMethod,
  publicKeyFromDid,
  verificationMethodFor,
  type Signer,
} from "./did";
import { b58decode, b58encode, concatBytes, jcs, sha256Bytes } from "./util";

/**
 * W3C Data Integrity proof, cryptosuite `eddsa-jcs-2022`:
 *   hashData = SHA-256(JCS(proofConfig)) || SHA-256(JCS(unsecuredDocument))
 *   proofValue = multibase-base58btc(Ed25519(hashData))
 */
export interface DataIntegrityProof {
  type: "DataIntegrityProof";
  cryptosuite: "eddsa-jcs-2022";
  verificationMethod: string;
  created: string;
  proofPurpose: "assertionMethod" | "authentication";
  challenge?: string;
  domain?: string;
  proofValue: string;
}

export interface ProofOptions {
  created: string;
  purpose: DataIntegrityProof["proofPurpose"];
  challenge?: string;
  domain?: string;
}

export type WithProof<T> = T & { proof: DataIntegrityProof };
export type WithProofs<T> = T & { proof: DataIntegrityProof[] };

type ProofConfig = Omit<DataIntegrityProof, "proofValue">;

function configFor(signerDid: string, opts: ProofOptions): ProofConfig {
  const cfg: ProofConfig = {
    type: "DataIntegrityProof",
    cryptosuite: "eddsa-jcs-2022",
    verificationMethod: verificationMethodFor(signerDid),
    created: opts.created,
    proofPurpose: opts.purpose,
  };
  if (opts.challenge !== undefined) cfg.challenge = opts.challenge;
  if (opts.domain !== undefined) cfg.domain = opts.domain;
  return cfg;
}

function hashData(unsecured: object, config: ProofConfig): Uint8Array {
  return concatBytes(sha256Bytes(jcs(config)), sha256Bytes(jcs(unsecured)));
}

function stripProof<T extends object>(doc: T): Omit<T, "proof"> {
  const { proof: _p, ...rest } = doc as Record<string, unknown>;
  return rest as Omit<T, "proof">;
}

export function createProof(unsecured: object, signer: Signer, opts: ProofOptions): DataIntegrityProof {
  const config = configFor(signer.did, opts);
  const sig = signer.sign(hashData(unsecured, config));
  return { ...config, proofValue: "z" + b58encode(sig) };
}

/** Attach a single proof. */
export function signDocument<T extends object>(
  doc: T,
  signer: Signer,
  opts: ProofOptions,
): WithProof<Omit<T, "proof">> {
  const unsecured = stripProof(doc);
  return { ...unsecured, proof: createProof(unsecured, signer, opts) };
}

/** Attach several independent proofs (a proof set), e.g. both parties of a receipt. */
export function signDocumentMulti<T extends object>(
  doc: T,
  signers: Signer[],
  opts: ProofOptions,
): WithProofs<Omit<T, "proof">> {
  const unsecured = stripProof(doc);
  return { ...unsecured, proof: signers.map((s) => createProof(unsecured, s, opts)) };
}

export interface ProofCheck {
  ok: boolean;
  signer: string;
  code: "OK" | "BAD_SIGNATURE" | "BAD_SUITE" | "UNRESOLVABLE_KEY" | "MALFORMED";
  proof: DataIntegrityProof;
}

export function verifyProof(unsecured: object, proof: DataIntegrityProof): ProofCheck {
  const signer = didFromVerificationMethod(proof?.verificationMethod ?? "");
  const fail = (code: ProofCheck["code"]): ProofCheck => ({ ok: false, signer, code, proof });
  try {
    if (proof?.type !== "DataIntegrityProof" || proof.cryptosuite !== "eddsa-jcs-2022") {
      return fail("BAD_SUITE");
    }
    if (typeof proof.proofValue !== "string" || !proof.proofValue.startsWith("z")) {
      return fail("MALFORMED");
    }
    let publicKey: Uint8Array;
    try {
      publicKey = publicKeyFromDid(signer);
    } catch {
      return fail("UNRESOLVABLE_KEY");
    }
    const { proofValue, ...config } = proof;
    const sig = b58decode(proofValue.slice(1));
    const ok = ed25519.verify(sig, hashData(unsecured, config), publicKey);
    return ok ? { ok, signer, code: "OK", proof } : fail("BAD_SIGNATURE");
  } catch {
    return fail("MALFORMED");
  }
}

/** Verify every proof on a document. A document with no proof returns []. */
export function verifyDocument(doc: object & { proof?: unknown }): ProofCheck[] {
  const proofs = Array.isArray(doc.proof) ? doc.proof : doc.proof ? [doc.proof] : [];
  const unsecured = stripProof(doc);
  return (proofs as DataIntegrityProof[]).map((p) => verifyProof(unsecured, p));
}

export const proofList = (doc: { proof?: unknown }): DataIntegrityProof[] =>
  (Array.isArray(doc.proof) ? doc.proof : doc.proof ? [doc.proof] : []) as DataIntegrityProof[];
