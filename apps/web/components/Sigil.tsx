"use client";

import { sha256Bytes } from "@aval/core";
import { useMemo } from "react";

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** Hypotrochoid points scaled to a unit-ish circle. */
function curve(R: number, r: number, dRatio: number, steps = 900): string {
  const d = r * dRatio;
  const turns = r / gcd(R, r);
  const pts: [number, number][] = [];
  let max = 0;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2 * turns;
    const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
    const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
    pts.push([x, y]);
    max = Math.max(max, Math.hypot(x, y));
  }
  const k = 40 / max;
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${(x * k).toFixed(2)} ${(y * k).toFixed(2)}`).join("");
}

const RADII = [8, 10, 15, 16, 20, 24, 30, 40, 48, 60];

/**
 * A guilloche seal derived from a public key: same key, same seal, everywhere.
 * It is a fingerprint you can recognise at a glance, not a security feature.
 */
export function Sigil({ did, size = 56, title }: { did: string; size?: number; title?: string }) {
  const art = useMemo(() => {
    const b = sha256Bytes(did);
    const R = 120;
    const c1 = curve(R, RADII[b[0]! % RADII.length]!, 0.55 + (b[1]! % 60) / 100);
    const c2 = curve(R, RADII[(b[2]! + 3) % RADII.length]!, 0.45 + (b[3]! % 70) / 100);
    const c3 = curve(R, RADII[(b[6]! + 5) % RADII.length]!, 0.3 + (b[7]! % 50) / 100, 700);
    const ticks = 28 + (b[4]! % 24);
    const tick = Array.from({ length: ticks }, (_, i) => {
      const a = (i / ticks) * Math.PI * 2;
      const r1 = 45.5;
      const r2 = i % 4 === 0 ? 49 : 47.5;
      return `M${(Math.cos(a) * r1).toFixed(2)} ${(Math.sin(a) * r1).toFixed(2)}L${(Math.cos(a) * r2).toFixed(2)} ${(Math.sin(a) * r2).toFixed(2)}`;
    }).join("");
    return { c1, c2, c3, tick, rot: (b[5]! / 255) * 360 };
  }, [did]);

  return (
    <svg className="sigil" viewBox="-50 -50 100 100" width={size} height={size} role="img" aria-label={title ?? "identity seal"}>
      <title>{title ?? "identity seal"}</title>
      <circle r="49" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle r="43.5" fill="none" stroke="currentColor" strokeWidth="0.5" />
      <path d={art.tick} fill="none" stroke="currentColor" strokeWidth="0.8" />
      <g transform={`rotate(${art.rot})`} fill="none" stroke="currentColor">
        <path d={art.c1} strokeWidth="0.7" />
        <path d={art.c2} strokeWidth="0.5" opacity="0.8" />
        <path d={art.c3} strokeWidth="0.4" opacity="0.6" transform="scale(0.55)" />
      </g>
      <circle r="4.5" fill="currentColor" />
    </svg>
  );
}
