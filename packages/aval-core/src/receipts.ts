import type { Signer } from "./did";
import { publicKeyFromDid } from "./did";
import { signDocumentMulti, verifyDocument, type WithProofs } from "./sign";
import { VC_CONTEXT } from "./credentials";
import { contentId, jcs, sha256Hex, toMillis } from "./util";

export type Outcome = "fulfilled" | "defaulted" | "disputed";

export interface InteractionReceiptUnsigned {
  "@context": string[];
  id: string;
  type: "InteractionReceipt";
  requester: string;
  provider: string;
  task: { hash: string; description: string; value: number };
  outcome: Outcome;
  completedAt: string;
  /** Per party: id of that party's previous receipt (null = first). This is the hash chain. */
  prev: Record<string, string | null>;
}
export type InteractionReceipt = WithProofs<InteractionReceiptUnsigned>;

/**
 * A receipt is only valid when BOTH parties sign the same bytes. An agent therefore cannot
 * write its own history, only agree it with a counterparty holding a different key.
 */
export function createReceipt(args: {
  requester: Signer;
  provider: Signer;
  description: string;
  value: number;
  outcome: Outcome;
  completedAt: string;
  prev: Record<string, string | null>;
}): InteractionReceipt {
  const unsigned = {
    "@context": [VC_CONTEXT],
    type: "InteractionReceipt" as const,
    requester: args.requester.did,
    provider: args.provider.did,
    task: { hash: sha256Hex(args.description), description: args.description, value: args.value },
    outcome: args.outcome,
    completedAt: args.completedAt,
    prev: {
      [args.requester.did]: args.prev[args.requester.did] ?? null,
      [args.provider.did]: args.prev[args.provider.did] ?? null,
    },
  };
  const id = contentId("receipt", unsigned);
  return signDocumentMulti({ id, ...unsigned }, [args.requester, args.provider], {
    created: args.completedAt,
    purpose: "assertionMethod",
  }) as InteractionReceipt;
}

/** Append-only store that tracks each party's chain head while building receipts. */
export class Ledger {
  readonly receipts: InteractionReceipt[] = [];
  private heads = new Map<string, string>();

  record(args: {
    requester: Signer;
    provider: Signer;
    description: string;
    value: number;
    outcome: Outcome;
    completedAt: string;
  }): InteractionReceipt {
    const prev: Record<string, string | null> = {
      [args.requester.did]: this.heads.get(args.requester.did) ?? null,
      [args.provider.did]: this.heads.get(args.provider.did) ?? null,
    };
    const r = createReceipt({ ...args, prev });
    this.receipts.push(r);
    this.heads.set(args.requester.did, r.id);
    this.heads.set(args.provider.did, r.id);
    return r;
  }

  /** Load previously recorded receipts (in chain order) and rebuild each party's head. */
  load(receipts: InteractionReceipt[]) {
    for (const r of receipts) {
      this.receipts.push(r);
      this.heads.set(r.requester, r.id);
      this.heads.set(r.provider, r.id);
    }
  }

  for(did: string): InteractionReceipt[] {
    return this.receipts.filter((r) => r.requester === did || r.provider === did);
  }

  head(did: string): string | null {
    return this.heads.get(did) ?? null;
  }
}

export const counterpartyOf = (r: InteractionReceipt, did: string): string =>
  r.requester === did ? r.provider : r.requester;

export type ReceiptFault =
  | "RECEIPT_ID_MISMATCH"
  | "RECEIPT_SIG_INVALID"
  | "RECEIPT_PARTY_MISMATCH"
  | "RECEIPT_MALFORMED";

type ReceiptCheck = { ok: true } | { ok: false; code: ReceiptFault; detail: string };

const checkCache = new Map<string, ReceiptCheck>();

/**
 * Check a single receipt: content id, and a valid proof from each of its two parties.
 * Memoised on a hash of the FULL signed bytes (proofs included), so the cache can never
 * mask tampering: any change to the document is a different key and is verified afresh.
 */
export function checkReceipt(r: InteractionReceipt): ReceiptCheck {
  let key: string;
  try {
    key = sha256Hex(jcs(r));
  } catch {
    return { ok: false, code: "RECEIPT_MALFORMED", detail: "receipt could not be parsed" };
  }
  const hit = checkCache.get(key);
  if (hit) return hit;
  const result = checkReceiptUncached(r);
  if (checkCache.size > 20_000) checkCache.clear();
  checkCache.set(key, result);
  return result;
}

function checkReceiptUncached(r: InteractionReceipt): ReceiptCheck {
  try {
    if (r.type !== "InteractionReceipt" || r.requester === r.provider) {
      return { ok: false, code: "RECEIPT_MALFORMED", detail: "receipt must have two distinct parties" };
    }
    publicKeyFromDid(r.requester);
    publicKeyFromDid(r.provider);
    if (contentId("receipt", r) !== r.id) {
      return { ok: false, code: "RECEIPT_ID_MISMATCH", detail: "content hash does not match receipt id" };
    }
    if (sha256Hex(r.task.description) !== r.task.hash) {
      return { ok: false, code: "RECEIPT_ID_MISMATCH", detail: "task hash does not match task description" };
    }
    const checks = verifyDocument(r);
    const bad = checks.find((c) => !c.ok);
    if (bad) return { ok: false, code: "RECEIPT_SIG_INVALID", detail: `signature by ${short(bad.signer)} failed (${bad.code})` };
    const signers = new Set(checks.map((c) => c.signer));
    if (!signers.has(r.requester) || !signers.has(r.provider)) {
      return { ok: false, code: "RECEIPT_PARTY_MISMATCH", detail: "both parties must sign" };
    }
    return { ok: true };
  } catch {
    return { ok: false, code: "RECEIPT_MALFORMED", detail: "receipt could not be parsed" };
  }
}

export type HistoryFault = "HISTORY_BROKEN" | "HISTORY_FORK" | "HISTORY_ORDER";

/**
 * Verify that `receipts` form one unbroken chain for `did`: exactly one start, no forks,
 * no dangling pointers, timestamps non-decreasing. Removing or rewriting any receipt
 * from the middle of the chain breaks this. (Truncating the *tail* cannot be detected
 * from the holder's own bundle alone. See docs/ATTACKS.md "what this doesn't solve".)
 */
export function checkChain(
  did: string,
  receipts: InteractionReceipt[],
): { ok: true; ordered: InteractionReceipt[] } | { ok: false; code: HistoryFault; detail: string } {
  if (receipts.length === 0) return { ok: true, ordered: [] };
  const byId = new Map(receipts.map((r) => [r.id, r]));
  if (byId.size !== receipts.length) return { ok: false, code: "HISTORY_FORK", detail: "duplicate receipt" };

  const children = new Map<string | null, InteractionReceipt[]>();
  for (const r of receipts) {
    const prev = r.prev?.[did];
    if (prev === undefined) return { ok: false, code: "HISTORY_BROKEN", detail: "receipt has no chain pointer for holder" };
    if (prev !== null && !byId.has(prev)) {
      return { ok: false, code: "HISTORY_BROKEN", detail: `chain points to missing receipt ${short(prev)}` };
    }
    const list = children.get(prev) ?? [];
    list.push(r);
    children.set(prev, list);
  }
  for (const [prev, list] of children) {
    if (list.length > 1) {
      return { ok: false, code: "HISTORY_FORK", detail: `two receipts claim to follow ${prev ? short(prev) : "the start"}` };
    }
  }
  const ordered: InteractionReceipt[] = [];
  let cursor: InteractionReceipt | undefined = children.get(null)?.[0];
  while (cursor) {
    ordered.push(cursor);
    cursor = children.get(cursor.id)?.[0];
  }
  if (ordered.length !== receipts.length) {
    return { ok: false, code: "HISTORY_BROKEN", detail: "receipts do not form a single chain" };
  }
  for (let i = 1; i < ordered.length; i++) {
    if (toMillis(ordered[i]!.completedAt) < toMillis(ordered[i - 1]!.completedAt)) {
      return { ok: false, code: "HISTORY_ORDER", detail: "timestamps go backwards along the chain" };
    }
  }
  return { ok: true, ordered };
}

const short = (s: string) => (s.length > 18 ? `${s.slice(0, 14)}…${s.slice(-4)}` : s);
