import type { Signer } from "./did";
import { signDocument, verifyDocument, type WithProof } from "./sign";
import { toMillis } from "./util";

/**
 * A signed, timestamped list of revoked credential ids. Simplified from Bitstring Status
 * List: the point is the semantics (issuer-signed, freshness-bound), not the compression.
 */
export interface RevocationListUnsigned {
  type: "AvalRevocationList";
  issuer: string;
  issuedAt: string;
  revoked: string[];
}
export type RevocationList = WithProof<RevocationListUnsigned>;

export function publishRevocationList(issuer: Signer, revoked: string[], issuedAt: string): RevocationList {
  return signDocument(
    { type: "AvalRevocationList" as const, issuer: issuer.did, issuedAt, revoked: [...revoked].sort() },
    issuer,
    { created: issuedAt, purpose: "assertionMethod" },
  ) as RevocationList;
}

export type RevocationCheck =
  | { ok: true }
  | { ok: false; code: "REVOCATION_UNAVAILABLE" | "REVOCATION_INVALID" | "REVOCATION_STALE" | "CREDENTIAL_REVOKED"; detail: string };

/**
 * Fail closed: no list, a list we cannot authenticate, or a list older than `maxAgeSec`
 * all mean "cannot show this credential is still good", so verification fails.
 */
export function checkRevocation(args: {
  credentialId: string;
  issuer: string;
  list: RevocationList | undefined;
  now: string;
  maxAgeSec: number;
}): RevocationCheck {
  const { list } = args;
  if (!list) return { ok: false, code: "REVOCATION_UNAVAILABLE", detail: "issuer has published no revocation list" };
  const proofs = verifyDocument(list);
  if (list.type !== "AvalRevocationList" || list.issuer !== args.issuer || proofs.length !== 1 || !proofs[0]!.ok || proofs[0]!.signer !== args.issuer) {
    return { ok: false, code: "REVOCATION_INVALID", detail: "revocation list is not validly signed by the issuer" };
  }
  const age = (toMillis(args.now) - toMillis(list.issuedAt)) / 1000;
  if (age > args.maxAgeSec) {
    return { ok: false, code: "REVOCATION_STALE", detail: `list is ${Math.round(age)}s old, limit ${args.maxAgeSec}s` };
  }
  if (list.revoked.includes(args.credentialId)) {
    return { ok: false, code: "CREDENTIAL_REVOKED", detail: "credential is on the issuer's revocation list" };
  }
  return { ok: true };
}
