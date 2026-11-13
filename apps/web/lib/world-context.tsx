"use client";

import {
  DecisionLog,
  PROCUREMENT_POLICY,
  VENDOR_POLICY,
  World,
  evaluate,
  type Evaluation,
  type Policy,
  type WorldFixture,
} from "@aval/core";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type Direction = "buyer-checks-vendor" | "vendor-checks-buyer";

export interface HistoryEntry {
  n: number;
  evaluation: Evaluation;
  presenterId: string;
  verifierId: string;
  value: number;
  policy: Policy;
}

interface Ctx {
  world: World | null;
  error: string | null;
  /** Bumps whenever the world is mutated (e.g. a revocation) so views can re-render. */
  version: number;
  history: HistoryEntry[];
  check(args: { direction: Direction; counterpartId: string; value: number }): HistoryEntry;
  toggleRevoke(actorId: string): void;
  isRevoked(actorId: string): boolean;
  reset(): void;
  /** A pristine, private copy of the world: the Attack Lab never touches the live one. */
  fresh(): World;
}

const WorldCtx = createContext<Ctx | null>(null);

export function WorldProvider({ children }: { children: ReactNode }) {
  const [world, setWorld] = useState<World | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const fixture = useRef<WorldFixture | null>(null);
  const logs = useRef(new Map<string, DecisionLog>());
  const counter = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/world.json")
      .then((r) => {
        if (!r.ok) throw new Error(`world.json: ${r.status}`);
        return r.json() as Promise<WorldFixture>;
      })
      .then((f) => {
        if (cancelled) return;
        fixture.current = f;
        setWorld(World.fromFixture(f));
      })
      .catch((e) => !cancelled && setError(String(e?.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, []);

  const check: Ctx["check"] = useCallback(
    ({ direction, counterpartId, value }) => {
      if (!world) throw new Error("world not loaded");
      const buyerMode = direction === "buyer-checks-vendor";
      const verifierId = buyerMode ? "atlas" : counterpartId;
      const presenterId = buyerMode ? counterpartId : "atlas";
      const policy = buyerMode ? PROCUREMENT_POLICY : VENDOR_POLICY;
      const verifier = world.actor(verifierId).signer;
      let log = logs.current.get(verifier.did);
      if (!log) {
        log = new DecisionLog();
        logs.current.set(verifier.did, log);
      }
      const evaluation = evaluate({
        presentation: world.present(presenterId, verifier),
        request: { action: policy.action, value },
        policy,
        ctx: world.context(verifier),
        evaluator: verifier,
        log,
      });
      const entry: HistoryEntry = { n: ++counter.current, evaluation, presenterId, verifierId, value, policy };
      setHistory((h) => [entry, ...h].slice(0, 40));
      return entry;
    },
    [world],
  );

  const rootOf = useCallback(
    (actorId: string) => {
      if (!world) return null;
      const chain = world.actor(actorId).chain;
      const root = chain[chain.length - 1];
      return root ? { id: root.id, issuer: root.issuer } : null;
    },
    [world],
  );

  const isRevoked = useCallback(
    (actorId: string) => {
      const root = rootOf(actorId);
      return !!root && !!world?.lists.get(root.issuer)?.revoked.includes(root.id);
    },
    [rootOf, world, version], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const toggleRevoke = useCallback(
    (actorId: string) => {
      const root = rootOf(actorId);
      if (!world || !root) return;
      if (world.lists.get(root.issuer)?.revoked.includes(root.id)) world.unrevoke(root.id, root.issuer);
      else world.revoke(root.id, root.issuer);
      setVersion((v) => v + 1);
    },
    [rootOf, world],
  );

  const reset = useCallback(() => {
    if (!fixture.current) return;
    setWorld(World.fromFixture(fixture.current));
    logs.current.clear();
    setHistory([]);
    setVersion((v) => v + 1);
  }, []);

  const fresh = useCallback(() => {
    if (!fixture.current) throw new Error("world not loaded");
    return World.fromFixture(fixture.current);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ world, error, version, history, check, toggleRevoke, isRevoked, reset, fresh }),
    [world, error, version, history, check, toggleRevoke, isRevoked, reset, fresh],
  );
  return <WorldCtx.Provider value={value}>{children}</WorldCtx.Provider>;
}

export function useWorld(): Ctx {
  const c = useContext(WorldCtx);
  if (!c) throw new Error("useWorld outside WorldProvider");
  return c;
}
