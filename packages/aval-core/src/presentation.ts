import { bytesToHex } from "./util";
import type { Signer } from "./did";
import type { Attestation, AuthorityGrant } from "./credentials";
import { VC_CONTEXT } from "./credentials";
import type { InteractionReceipt } from "./receipts";
import { signDocument, type WithProof } from "./sign";
import { addSeconds, toMillis } from "./util";

export interface Challenge {
  nonce: string;
  /** DID of the verifier this challenge is for. */
  audience: string;
  issuedAt: string;
  expiresAt: string;
}

export type ChallengeResult = "ok" | "unknown" | "expired" | "wrong-audience" | "replayed";

/** Verifier-side single-use nonce store. */
export class ChallengeStore {
  private pending = new Map<string, Challenge>();
  private used = new Set<string>();

  issue(audience: string, now: string, ttlSec = 60, nonce?: string): Challenge {
    const n = nonce ?? bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
    const c: Challenge = { nonce: n, audience, issuedAt: now, expiresAt: addSeconds(now, ttlSec) };
    this.pending.set(n, c);
    return c;
  }

  consume(nonce: string | undefined, audience: string, now: string): ChallengeResult {
    if (!nonce) return "unknown";
    if (this.used.has(nonce)) return "replayed";
    const c = this.pending.get(nonce);
    if (!c) return "unknown";
    if (c.audience !== audience) return "wrong-audience";
    if (toMillis(now) > toMillis(c.expiresAt)) return "expired";
    this.pending.delete(nonce);
    this.used.add(nonce);
    return "ok";
  }
}

export interface PresentationUnsigned {
  "@context": string[];
  type: "VerifiablePresentation";
  holder: string;
  /** Delegation chain, leaf first: chain[0].subject is the holder, last is a root grant. */
  authorityChain: AuthorityGrant[];
  attestations: Attestation[];
  receipts: InteractionReceipt[];
}
export type Presentation = WithProof<PresentationUnsigned>;

/**
 * The holder signs the whole bundle together with the verifier's nonce and DID. A copied
 * bundle is worthless without the holder's key, and a captured presentation is worthless
 * for any other verifier or any later nonce.
 */
export function createPresentation(args: {
  holder: Signer;
  challenge: Pick<Challenge, "nonce" | "audience">;
  authorityChain: AuthorityGrant[];
  attestations?: Attestation[];
  receipts?: InteractionReceipt[];
  created: string;
}): Presentation {
  const unsigned: PresentationUnsigned = {
    "@context": [VC_CONTEXT],
    type: "VerifiablePresentation",
    holder: args.holder.did,
    authorityChain: args.authorityChain,
    attestations: args.attestations ?? [],
    receipts: args.receipts ?? [],
  };
  return signDocument(unsigned, args.holder, {
    created: args.created,
    purpose: "authentication",
    challenge: args.challenge.nonce,
    domain: args.challenge.audience,
  }) as Presentation;
}
