# AVAL — a checkpoint for agents

> *An aval is the guarantor's signature on a bill of exchange: a promise anyone can check.*

**The Agent That Earns Trust** · DOO Builders League entry.

Every agent carries a **passport** of signed credentials. Every counterparty runs a **checkpoint**
of ten verification stages. Every decision prints a **signed receipt** anyone can re-verify.

There is no stored score. Standing is recomputed by each verifier from co-signed receipts, then
passed through that verifier's own policy. The same agent can be accepted by one desk and refused by
another.

## Run it

```bash
pnpm i
pnpm dev          # http://localhost:3000
pnpm test         # 47 tests, including all ten attacks
pnpm build
```

No environment variables, no database, no network calls. The demo world is deterministic: keys are
derived from public seeds, so everything in it is reproducible and none of it protects anything real.

## What to try

| Page | What it shows |
|---|---|
| **The Floor** `/` | Pick an agent and a price. Watch the ten-stage checkpoint run and a signed decision receipt print. Revoke Vesper's authority mid-session and re-run: same agent, different answer. Flip direction: the vendor checks Atlas under the vendor's own rules. |
| **Attack Lab** `/attacks` | Ten real attacks run against the real verifier, each stopped at the stage that actually failed. |
| **Verify it yourself** `/verify` | Take any receipt, grant, vouch or revocation list, change one byte, and watch the exact check fail. Runs in the browser. |
| **Passport** `/passport/halcyon` | Grant chain as visa pages, vouches, derived standing, co-signed history. |
| **Architecture** `/architecture` | The four layers, six principles, threat table, limits, and the two-year thesis. |

Deep links for demos: `/?agent=fennel&value=400&run=1`, `/?agent=mallory&run=1`, `/attacks?run=all`.

## The three behaviours that matter

1. **Halcyon ($3,000): ACCEPT.** Authority chains to a trusted issuer, 141 co-signed receipts from 14
   independent counterparties, lower bound 94%.
2. **Fennel ($400): ACCEPT WITH CONDITIONS.** New and credentialed but unproven. The policy offers a
   capped, escrowed probation tier rather than a refusal. Unknown is not bad.
3. **Halcyon-clone, Mallory, Ringo-1: REFUSE**, at stages 7, 3 and 10 respectively, each with a reason
   code and a signed receipt.

## Layout

```
packages/aval-core   Protocol + verifier + policy + attacks. Pure TypeScript, no UI.
apps/web             Next.js app. Runs the same library in the browser.
docs/                ARCHITECTURE, ATTACKS, THESIS, DECISIONS
```

The library is the product; the app is a window onto it. Both the Floor and the Attack Lab call the
same `evaluate()` used by the test suite.

## Standards

DIDs (`did:key`, Ed25519) · W3C Verifiable Credentials 2.0 envelopes · Data Integrity proofs with
`eddsa-jcs-2022` (RFC 8785 canonical JSON) · revocation in the spirit of Bitstring Status List
(simplified to a signed id list) · UCAN-style attenuation for delegation.

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): layers, the ten stages, data model
- [`docs/ATTACKS.md`](docs/ATTACKS.md): threat table and what this does **not** solve
- [`docs/THESIS.md`](docs/THESIS.md): the two-year thesis (under 300 words)
- [`docs/DECISIONS.md`](docs/DECISIONS.md): choices, trade-offs, AI tools used, out of scope
