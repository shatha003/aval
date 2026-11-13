import type { Signer } from "./did";
import { signDocument, type WithProof } from "./sign";
import { contentId } from "./util";

export const VC_CONTEXT = "https://www.w3.org/ns/credentials/v2";

/** One thing an agent is allowed to do. maxValue is in USD; undefined = unbounded. */
export interface Scope {
  action: string;
  maxValue?: number;
}

export interface GrantSubject {
  /** DID of the agent receiving authority. */
  id: string;
  scopes: Scope[];
  /** How many further delegations the holder may make. 0 = leaf, cannot delegate. */
  remainingDepth: number;
  /** Credential id this grant was delegated from; null for a root grant. */
  parent: string | null;
}

export interface AttestationSubject {
  /** DID of the agent being vouched for. */
  id: string;
  claim: string;
  /** Receipt ids that justify the vouch. */
  evidence: string[];
  /** Voucher's declared confidence, 0..1. Verifiers weight it by the voucher's own standing. */
  weight: number;
}

interface CredentialBase<T extends string, S> {
  "@context": string[];
  id: string;
  type: ["VerifiableCredential", T];
  issuer: string;
  validFrom: string;
  validUntil: string;
  credentialSubject: S;
}

export type AuthorityGrantUnsigned = CredentialBase<"AuthorityGrant", GrantSubject>;
export type AttestationUnsigned = CredentialBase<"Attestation", AttestationSubject>;
export type AuthorityGrant = WithProof<AuthorityGrantUnsigned>;
export type Attestation = WithProof<AttestationUnsigned>;

export interface IssueWindow {
  validFrom: string;
  validUntil: string;
  /** proof `created` timestamp */
  created: string;
}

export function issueGrant(args: {
  issuer: Signer;
  holder: string;
  scopes: Scope[];
  remainingDepth?: number;
  parent?: string | null;
  window: IssueWindow;
}): AuthorityGrant {
  const unsigned = {
    "@context": [VC_CONTEXT],
    type: ["VerifiableCredential", "AuthorityGrant"] as ["VerifiableCredential", "AuthorityGrant"],
    issuer: args.issuer.did,
    validFrom: args.window.validFrom,
    validUntil: args.window.validUntil,
    credentialSubject: {
      id: args.holder,
      scopes: args.scopes,
      remainingDepth: args.remainingDepth ?? 0,
      parent: args.parent ?? null,
    },
  };
  const id = contentId("grant", unsigned);
  return signDocument({ id, ...unsigned }, args.issuer, {
    created: args.window.created,
    purpose: "assertionMethod",
  }) as AuthorityGrant;
}

export function issueAttestation(args: {
  issuer: Signer;
  subject: string;
  claim: string;
  evidence?: string[];
  weight?: number;
  window: IssueWindow;
}): Attestation {
  const unsigned = {
    "@context": [VC_CONTEXT],
    type: ["VerifiableCredential", "Attestation"] as ["VerifiableCredential", "Attestation"],
    issuer: args.issuer.did,
    validFrom: args.window.validFrom,
    validUntil: args.window.validUntil,
    credentialSubject: {
      id: args.subject,
      claim: args.claim,
      evidence: args.evidence ?? [],
      weight: args.weight ?? 0.5,
    },
  };
  const id = contentId("attestation", unsigned);
  return signDocument({ id, ...unsigned }, args.issuer, {
    created: args.window.created,
    purpose: "assertionMethod",
  }) as Attestation;
}

/** Does `parent` cover a request for `child`? Actions match exactly or via a trailing `.*`. */
export function actionCovers(parentAction: string, childAction: string): boolean {
  if (parentAction === "*" || parentAction === childAction) return true;
  if (parentAction.endsWith(".*")) return childAction.startsWith(parentAction.slice(0, -1));
  return false;
}

export function scopeCovers(parent: Scope, child: Scope): boolean {
  if (!actionCovers(parent.action, child.action)) return false;
  if (parent.maxValue === undefined) return true;
  return child.maxValue !== undefined && child.maxValue <= parent.maxValue;
}

/** Attenuation: every child scope must sit inside some parent scope. */
export function scopesAttenuate(parent: Scope[], child: Scope[]): boolean {
  return child.every((c) => parent.some((p) => scopeCovers(p, c)));
}
