import { ed25519 } from "@noble/curves/ed25519";
import { b58decode, b58encode, concatBytes, sha256Bytes, utf8ToBytes } from "./util";

/** multicodec varint for ed25519-pub */
const ED25519_PUB = Uint8Array.from([0xed, 0x01]);
const PREFIX = "did:key:z";

export class DidError extends Error {}

export interface Signer {
  did: string;
  publicKey: Uint8Array;
  sign(message: Uint8Array): Uint8Array;
}

export function didFromPublicKey(publicKey: Uint8Array): string {
  return PREFIX + b58encode(concatBytes(ED25519_PUB, publicKey));
}

/** Resolve a did:key to its raw Ed25519 public key. Throws DidError if malformed. */
export function publicKeyFromDid(did: string): Uint8Array {
  if (typeof did !== "string" || !did.startsWith(PREFIX)) {
    throw new DidError(`unsupported DID method: ${String(did).slice(0, 24)}`);
  }
  let bytes: Uint8Array;
  try {
    bytes = b58decode(did.slice(PREFIX.length));
  } catch {
    throw new DidError("DID is not valid base58btc");
  }
  if (bytes.length !== 34 || bytes[0] !== ED25519_PUB[0] || bytes[1] !== ED25519_PUB[1]) {
    throw new DidError("DID does not encode an Ed25519 public key");
  }
  return bytes.slice(2);
}

export function isResolvableDid(did: string): boolean {
  try {
    publicKeyFromDid(did);
    return true;
  } catch {
    return false;
  }
}

export const verificationMethodFor = (did: string): string =>
  `${did}#${did.slice("did:key:".length)}`;

export const didFromVerificationMethod = (vm: string): string => vm.split("#")[0] ?? "";

function signerFromSecret(secret: Uint8Array): Signer {
  const publicKey = ed25519.getPublicKey(secret);
  return {
    did: didFromPublicKey(publicKey),
    publicKey,
    sign: (message) => ed25519.sign(message, secret),
  };
}

/** Deterministic keypair for fixtures. NEVER use for real identities; demo keys are public. */
export function keypairFromSeed(seed: string): Signer {
  return signerFromSecret(sha256Bytes(utf8ToBytes(`aval-demo-key:${seed}`)));
}

export function generateKeypair(): Signer {
  return signerFromSecret(ed25519.utils.randomPrivateKey());
}
