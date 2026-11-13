import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils";
import canonicalize from "canonicalize";

export { bytesToHex, concatBytes, utf8ToBytes };

/** RFC 8785 JSON Canonicalization Scheme. */
export function jcs(value: unknown): string {
  const out = canonicalize(value);
  if (out === undefined) throw new Error("value is not canonicalizable");
  return out;
}

export function sha256Bytes(input: string | Uint8Array): Uint8Array {
  return sha256(typeof input === "string" ? utf8ToBytes(input) : input);
}

export function sha256Hex(input: string | Uint8Array): string {
  return bytesToHex(sha256Bytes(input));
}

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** base58btc (Bitcoin alphabet), the encoding multibase 'z' denotes. */
export function b58encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  return "1".repeat(zeros) + out;
}

export function b58decode(str: string): Uint8Array {
  let zeros = 0;
  while (zeros < str.length && str[zeros] === "1") zeros++;
  let n = 0n;
  for (const ch of str) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`invalid base58 character '${ch}'`);
    n = n * 58n + BigInt(idx);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  return Uint8Array.from([...new Array(zeros).fill(0), ...bytes]);
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2) throw new Error("odd hex length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Content-addressed id: hash of the document without its own id/proof. */
export function contentId(prefix: string, doc: object): string {
  const { id: _id, proof: _proof, ...rest } = doc as Record<string, unknown>;
  return `urn:aval:${prefix}:${sha256Hex(jcs(rest)).slice(0, 32)}`;
}

export const toMillis = (iso: string): number => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`invalid timestamp '${iso}'`);
  return t;
};

export const addSeconds = (iso: string, seconds: number): string =>
  new Date(toMillis(iso) + seconds * 1000).toISOString();
