import { ATTACKS } from "@aval/core";
import Link from "next/link";
import { THESIS, THESIS_TITLE } from "@/content/thesis";

export const metadata = { title: "Architecture · AVAL" };

const FLOW = [
  {
    n: "I",
    name: "Identity",
    q: "Who is this?",
    items: ["did:key, an Ed25519 public key as the identifier", "No registry to trust: the key is the name", "Proved live by signing the verifier’s nonce, addressed to the verifier"],
    stages: "1 · 7",
  },
  {
    n: "II",
    name: "Claims",
    q: "What do they say about themselves, and who else says it?",
    items: ["AuthorityGrant: scoped, capped, expiring, delegable", "Attestation: a vouch from a peer, with evidence", "InteractionReceipt: a job, signed by both sides"],
    stages: "2",
  },
  {
    n: "III",
    name: "Verification",
    q: "Is any of it true?",
    items: ["Signatures over canonical bytes (JCS + Ed25519)", "Chain reaches an issuer I chose to trust", "In date, not revoked (fresh list or fail closed)", "Delegation only narrows; history unbroken"],
    stages: "3 · 4 · 5 · 6 · 8",
  },
  {
    n: "IV",
    name: "Policy",
    q: "Given the proven facts, what do I do?",
    items: ["Standing: Beta posterior over verified receipts", "My rulebook: tiers by task value", "Verdict + reasons + conditions", "Signed into a hash-chained decision log"],
    stages: "9 · 10",
  },
];

const PRINCIPLES = [
  ["Credentials say what is claimed. Presentations prove who is claiming.", "A stolen credential is worthless without the key. The holder signs a verifier-issued nonce bound to the verifier’s own DID."],
  ["Authority only narrows.", "A delegated grant must sit inside its parent on every axis: scope, value cap, expiry, remaining depth. This is checked mechanically, not reviewed."],
  ["History is co-signed.", "A receipt needs the counterparty’s signature. An agent cannot write its own reputation; it can only agree it with a holder of a different key, and diversity rules then discount the circle."],
  ["Reputation is a range, not a point.", "A Beta posterior with time decay, reported as a lower bound. Policy reads the lower bound, so a short lucky record cannot buy trust. A new agent is unknown, not bad."],
  ["Fail closed.", "A stale or missing revocation list, an issuer that cannot be resolved, a malformed proof: all of them refuse, with a reason code. Nothing passes by default."],
  ["The model proposes; the policy disposes.", "Agents are free to talk. The gate is deterministic code that never reads natural language, so persuasion cannot move it."],
];

const LIMITS = [
  ["Key compromise before revocation.", "A stolen key acts as its owner until the issuer revokes. Freshness windows shorten the gap; they do not close it."],
  ["Collusion between real, independent parties.", "Diversity and independence rules make fake reputation expensive, not impossible. Two honest-looking firms can still agree to lie."],
  ["Dropping the newest receipt.", "A holder’s own bundle cannot prove it is complete at the tail. A real deployment needs counterparties to publish chain heads, or verifiers to ask them."],
  ["Privacy.", "Presenting receipts reveals who you traded with. Selective disclosure and zero-knowledge properties are the obvious next step and are out of scope here."],
  ["Bootstrapping roots.", "Someone has to be trusted first. AVAL makes that choice explicit and per-verifier, but it does not remove it."],
];

export default function Architecture() {
  return (
    <main className="page">
      <section className="hero hero-sub">
        <h1>
          Identity, claims, verification, <em>policy.</em>
        </h1>
        <p className="lede">
          Four layers, each answering one question, each unable to do the next one’s job. The score you see on the Floor
          is the last step of a pipeline, not a number someone typed in.
        </p>
      </section>

      <section className="flow" aria-label="Architecture">
        {FLOW.map((f, i) => (
          <div key={f.name} className="flow-step">
            <div className="flow-head">
              <span className="flow-n">{f.n}</span>
              <h2>{f.name}</h2>
              <span className="flow-stages mono">stage {f.stages}</span>
            </div>
            <p className="flow-q">{f.q}</p>
            <ul>
              {f.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
            {i < FLOW.length - 1 && <span className="flow-arrow" aria-hidden="true">→</span>}
          </div>
        ))}
      </section>

      <section className="doc">
        <h2>Six principles</h2>
        <ol className="principles">
          {PRINCIPLES.map(([t, d], i) => (
            <li key={t}>
              <span className="principle-n">{i + 1}</span>
              <div>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="doc">
        <h2>Ten attacks, ten stages</h2>
        <p className="doc-lede">
          Every row is a test that runs in CI and a button in the <Link href="/attacks">Attack Lab</Link>.
        </p>
        <table className="ledger wide">
          <thead>
            <tr><th>#</th><th>Attack</th><th>Defence</th><th className="r">Stage</th><th>Code</th></tr>
          </thead>
          <tbody>
            {ATTACKS.map((a) => (
              <tr key={a.id}>
                <td className="mono">{a.id}</td>
                <td><b>{a.title}</b><br /><span className="muted">{a.threat}</span></td>
                <td>{a.defence}</td>
                <td className="r mono">{a.stage}</td>
                <td className="mono">{a.code.toLowerCase().replace(/_/g, " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="doc">
        <h2>What this does not solve</h2>
        <ul className="limits">
          {LIMITS.map(([t, d]) => (
            <li key={t}><b>{t}</b> {d}</li>
          ))}
        </ul>
      </section>

      <section className="doc">
        <h2>Built on standards</h2>
        <p className="doc-lede">
          <b>DIDs</b> (<span className="mono">did:key</span>), <b>W3C Verifiable Credentials 2.0</b> envelopes,{" "}
          <b>Data Integrity</b> proofs with the <span className="mono">eddsa-jcs-2022</span> cryptosuite (RFC 8785
          canonical JSON + Ed25519), revocation modelled on <b>Bitstring Status List</b> semantics (simplified to a signed
          id list), and delegation inspired by <b>UCAN</b> attenuation. Nothing proprietary: any verifier can re-implement
          it.
        </p>
      </section>

      <section className="thesis" id="thesis">
        <span className="label">Two-year thesis</span>
        <h2>{THESIS_TITLE}</h2>
        {THESIS.map((p) => (
          <p key={p.slice(0, 24)}>{p}</p>
        ))}
      </section>
    </main>
  );
}
