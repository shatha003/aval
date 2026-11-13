import { issueAttestation, issueGrant, type Attestation, type AuthorityGrant } from "./credentials";
import { keypairFromSeed, type Signer } from "./did";
import { ChallengeStore, createPresentation, type Challenge, type Presentation } from "./presentation";
import { Ledger, type InteractionReceipt } from "./receipts";
import { publishRevocationList, type RevocationList } from "./revocation";
import { addSeconds } from "./util";
import type { VerifierContext } from "./verify";

/**
 * The demo world. Everything is derived from public seeds so the repo is reproducible
 * and a clean clone behaves identically. These keys are demo keys and are published on
 * purpose; nothing here protects anything real.
 */
export const WORLD_NOW = "2026-11-14T12:00:00.000Z";
const DAY = 86_400;

export type Role = "principal" | "buyer" | "vendor" | "background";

export interface Actor {
  id: string;
  name: string;
  role: Role;
  blurb: string;
  /** Public demo seed the key is derived from. */
  seed: string;
  signer: Signer;
  chain: AuthorityGrant[];
  attestations: Attestation[];
  /** For the clone: present someone else's receipts as if they were its own. */
  borrowReceiptsFrom?: string;
}

const BG_NAMES = [
  "Quill", "Tern", "Marlow", "Juniper", "Basalt", "Cinder", "Wren",
  "Ostrava", "Pike", "Lumen", "Harrow", "Sable", "Drift", "Elm",
];

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

interface Event {
  requester: Signer;
  provider: Signer;
  value: number;
  outcome: "fulfilled" | "defaulted" | "disputed";
  daysAgo: number;
  what: string;
}

export interface WorldFixture {
  now: string;
  actors: Array<Omit<Actor, "signer">>;
  receipts: InteractionReceipt[];
  lists: RevocationList[];
}

export class World {
  readonly now = WORLD_NOW;
  readonly actors: Record<string, Actor> = {};
  readonly ledger = new Ledger();
  readonly lists = new Map<string, RevocationList>();
  private revoked = new Map<string, Set<string>>();
  private signers = new Map<string, Signer>();
  private stores = new Map<string, ChallengeStore>();
  private names = new Map<string, string>();

  constructor(fixture?: WorldFixture) {
    if (fixture) this.load(fixture);
    else this.build();
  }

  /** Everything needed to rebuild this world without re-signing a single receipt. */
  toFixture(): WorldFixture {
    return {
      now: this.now,
      actors: Object.values(this.actors).map(({ signer: _s, ...a }) => a),
      receipts: this.ledger.receipts,
      lists: [...this.lists.values()],
    };
  }

  static fromFixture(f: WorldFixture): World {
    return new World(f);
  }

  private load(f: WorldFixture) {
    for (const a of f.actors) {
      const signer = keypairFromSeed(a.seed);
      this.actors[a.id] = { ...a, signer };
      this.signers.set(signer.did, signer);
      this.names.set(signer.did, a.name);
    }
    this.ledger.load(f.receipts);
    for (const l of f.lists) {
      this.lists.set(l.issuer, l);
      this.revoked.set(l.issuer, new Set(l.revoked));
    }
  }

  nameOf(did: string): string {
    return this.names.get(did) ?? `${did.slice(0, 16)}…`;
  }

  get anchors(): string[] {
    return [this.actors.registry!.signer.did, this.actors.acme!.signer.did];
  }

  actor(id: string): Actor {
    const a = this.actors[id];
    if (!a) throw new Error(`unknown actor ${id}`);
    return a;
  }

  receiptsFor = (did: string): InteractionReceipt[] => this.ledger.for(did);

  private window(fromDaysAgo = 200, forDays = 500) {
    return {
      validFrom: addSeconds(this.now, -fromDaysAgo * DAY),
      validUntil: addSeconds(this.now, (forDays - fromDaysAgo) * DAY),
      created: addSeconds(this.now, -fromDaysAgo * DAY),
    };
  }

  private add(id: string, name: string, role: Role, blurb: string, seed = id): Actor {
    const signer = keypairFromSeed(seed);
    const actor: Actor = { id, name, role, blurb, seed, signer, chain: [], attestations: [] };
    this.actors[id] = actor;
    this.signers.set(signer.did, signer);
    this.names.set(signer.did, name);
    return actor;
  }

  /** Re-publish an issuer's revocation list at the world's current time. */
  publishList(issuerDid: string, issuedAt = this.now) {
    const signer = this.signers.get(issuerDid);
    if (!signer) return;
    const revoked = [...(this.revoked.get(issuerDid) ?? [])];
    this.lists.set(issuerDid, publishRevocationList(signer, revoked, issuedAt));
  }

  revoke(credentialId: string, issuerDid: string) {
    const set = this.revoked.get(issuerDid) ?? new Set<string>();
    set.add(credentialId);
    this.revoked.set(issuerDid, set);
    this.publishList(issuerDid);
  }

  unrevoke(credentialId: string, issuerDid: string) {
    this.revoked.get(issuerDid)?.delete(credentialId);
    this.publishList(issuerDid);
  }

  store(did: string): ChallengeStore {
    let s = this.stores.get(did);
    if (!s) {
      s = new ChallengeStore();
      this.stores.set(did, s);
    }
    return s;
  }

  challenge(verifier: Signer, now = this.now, nonce?: string): Challenge {
    return this.store(verifier.did).issue(verifier.did, now, 120, nonce);
  }

  context(verifier: Signer, over: Partial<VerifierContext> = {}): VerifierContext {
    return {
      did: verifier.did,
      anchors: this.anchors,
      now: this.now,
      revocation: (issuer) => this.lists.get(issuer),
      maxRevocationAgeSec: 3600,
      challenges: this.store(verifier.did),
      directory: this.receiptsFor,
      ...over,
    };
  }

  /** What an honest agent would hand a verifier: its own bundle, signed against the challenge. */
  present(actorId: string, verifier: Signer, challenge = this.challenge(verifier)): Presentation {
    const a = this.actor(actorId);
    const source = a.borrowReceiptsFrom ? this.actor(a.borrowReceiptsFrom) : a;
    return createPresentation({
      holder: a.signer,
      challenge,
      authorityChain: a.chain,
      attestations: a.attestations,
      receipts: this.receiptsFor(source.signer.did),
      created: this.now,
    });
  }

  private build() {
    // ---- principals (issuers) --------------------------------------------------------
    const registry = this.add("registry", "DOO Registry", "principal", "Neutral registry. Issues baseline authority to registered vendors.");
    const acme = this.add("acme", "Acme Corp", "principal", "A buyer. Issues authority to its own procurement agent.");
    const meridian = this.add("meridian", "Meridian Labs", "principal", "A vendor org. Delegates part of its registry authority to its agents.");

    // ---- agents ---------------------------------------------------------------------
    const atlas = this.add("atlas", "Atlas", "buyer", "Acme's procurement agent. Commissions work from vendors.");
    const halcyon = this.add("halcyon", "Halcyon", "vendor", "Veteran vendor agent: long clean history, vouched by independent peers.");
    const fennel = this.add("fennel", "Fennel", "vendor", "New vendor agent: properly credentialed, no track record yet.");
    const clone = this.add("clone", "Halcyon-clone", "vendor", "Copies Halcyon's credentials and receipts word for word.");
    const greedy = this.add("greedy", "Greedy", "vendor", "Legitimately authorised for small tasks, tries a very large one.");
    const ringo = [1, 2, 3].map((i) => this.add(`ringo${i}`, `Ringo-${i}`, "vendor", "Part of a ring that trades and vouches only among itself."));
    const mallory = this.add("mallory", "Mallory", "vendor", "Self-issues its own authority and talks its way past humans.");
    const vesper = this.add("vesper", "Vesper", "vendor", "Good standing today. Her authority gets revoked mid-session.");
    const bg = BG_NAMES.map((n) => this.add(`bg-${n.toLowerCase()}`, n, "background", "Independent agent that trades across the marketplace.", `bg-${n}`));

    // ---- authority ------------------------------------------------------------------
    const w = this.window();
    const rootMeridian = issueGrant({
      issuer: registry.signer,
      holder: meridian.signer.did,
      scopes: [{ action: "task.*", maxValue: 25_000 }],
      remainingDepth: 1,
      window: w,
    });
    halcyon.chain = [
      issueGrant({
        issuer: meridian.signer,
        holder: halcyon.signer.did,
        scopes: [{ action: "task.accept", maxValue: 10_000 }],
        remainingDepth: 0,
        parent: rootMeridian.id,
        window: w,
      }),
      rootMeridian,
    ];
    clone.chain = halcyon.chain;
    clone.borrowReceiptsFrom = "halcyon";
    clone.attestations = [];

    const direct = (a: Actor, maxValue: number) => {
      a.chain = [issueGrant({ issuer: registry.signer, holder: a.signer.did, scopes: [{ action: "task.accept", maxValue }], window: w })];
    };
    direct(fennel, 2_000);
    direct(greedy, 500);
    direct(vesper, 8_000);
    ringo.forEach((r) => direct(r, 5_000));
    atlas.chain = [issueGrant({ issuer: acme.signer, holder: atlas.signer.did, scopes: [{ action: "task.request", maxValue: 50_000 }], window: w })];
    bg.forEach((b) => direct(b, 5_000));
    // Mallory signs her own authority; no trusted issuer stands behind it.
    mallory.chain = [issueGrant({ issuer: mallory.signer, holder: mallory.signer.did, scopes: [{ action: "*" }], window: w })];

    // ---- history --------------------------------------------------------------------
    const rnd = lcg(0xa7a1);
    const events: Event[] = [];
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]!;
    const whats = ["data-cleaning batch", "translation pass", "invoice reconciliation", "market scan", "code review", "report draft", "dataset labelling"];
    const push = (requester: Actor, provider: Actor, n: number, valueRange: [number, number], maxAge: number, outcome: Event["outcome"] = "fulfilled") => {
      for (let i = 0; i < n; i++) {
        events.push({
          requester: requester.signer,
          provider: provider.signer,
          value: Math.round(valueRange[0] + rnd() * (valueRange[1] - valueRange[0])),
          outcome,
          daysAgo: 4 + rnd() * (maxAge - 4),
          what: `${pick(whats)} #${Math.floor(rnd() * 9000 + 1000)}`,
        });
      }
    };

    // Halcyon: 140 receipts over 14 independent counterparties; one dispute.
    bg.forEach((b) => push(b, halcyon, 10, [200, 4_000], 300));
    events.push({ requester: bg[2]!.signer, provider: halcyon.signer, value: 900, outcome: "disputed", daysAgo: 130.5, what: "translation pass #4417 (late)" });
    // A mesh among background agents, so vouchers have history of their own.
    bg.forEach((b, i) => {
      for (let k = 1; k <= 4; k++) push(b, bg[(i + k) % bg.length]!, 2, [150, 2_500], 280);
    });
    bg.slice(0, 9).forEach((b) => push(atlas, b, 3, [800, 6_000], 240));
    bg.slice(0, 8).forEach((b) => push(b, vesper, 4, [300, 3_000], 200));
    bg.slice(0, 5).forEach((b) => push(b, greedy, 3, [100, 450], 150));
    // The ring: 10 trades each along a closed triangle.
    push(ringo[0]!, ringo[1]!, 10, [400, 2_000], 90);
    push(ringo[1]!, ringo[2]!, 10, [400, 2_000], 90);
    push(ringo[2]!, ringo[0]!, 10, [400, 2_000], 90);

    // Record oldest-first so every party's hash chain is monotonic.
    events
      .sort((a, b) => b.daysAgo - a.daysAgo)
      .forEach((e) =>
        this.ledger.record({
          requester: e.requester,
          provider: e.provider,
          description: e.what,
          value: e.value,
          outcome: e.outcome,
          completedAt: addSeconds(this.now, -Math.round(e.daysAgo * DAY)),
        }),
      );

    // ---- vouches --------------------------------------------------------------------
    const vw = this.window(30, 365);
    const vouch = (from: Actor, to: Actor, weight: number, claim: string) => {
      to.attestations.push(issueAttestation({ issuer: from.signer, subject: to.signer.did, claim, weight, window: vw }));
    };
    for (const name of ["Marlow", "Basalt", "Ostrava"]) {
      vouch(this.actor(`bg-${name.toLowerCase()}`), halcyon, 0.8, "delivered reliably across repeated engagements");
    }
    vouch(this.actor("bg-quill"), vesper, 0.7, "delivered reliably");
    vouch(ringo[1]!, ringo[0]!, 1, "excellent counterparty");
    vouch(ringo[2]!, ringo[0]!, 1, "excellent counterparty");

    // ---- every issuer publishes a (fresh) revocation list ---------------------------------
    for (const a of Object.values(this.actors)) this.publishList(a.signer.did);
  }
}

export function buildWorld(): World {
  return new World();
}
