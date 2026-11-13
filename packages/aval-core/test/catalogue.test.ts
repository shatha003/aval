import { describe, expect, it } from "vitest";
import { ATTACKS, World, buildWorld } from "../src";

const fixture = buildWorld().toFixture();

describe("fixture", () => {
  it("a world rebuilt from its fixture behaves identically", () => {
    const fresh = World.fromFixture(JSON.parse(JSON.stringify(fixture)));
    const original = buildWorld();
    expect(fresh.actor("halcyon").signer.did).toBe(original.actor("halcyon").signer.did);
    expect(fresh.ledger.receipts.length).toBe(original.ledger.receipts.length);
    expect(Object.keys(fresh.actors).sort()).toEqual(Object.keys(original.actors).sort());
  });
});

describe("attack catalogue: every attack is stopped at its documented stage", () => {
  for (const attack of ATTACKS) {
    it(`${attack.id} ${attack.title} → stage ${attack.stage} ${attack.code}`, () => {
      const world = World.fromFixture(JSON.parse(JSON.stringify(fixture)));
      const { evaluation } = attack.run(world);
      expect(evaluation.decision.verdict).toBe("REFUSE");
      const stopped = evaluation.trace.find((s) => s.status === "fail")!;
      expect(stopped.stage).toBe(attack.stage);
      expect(stopped.code).toBe(attack.code);
    });
  }
});
