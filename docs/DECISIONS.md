# Decisions

## Key choices

- **Real cryptography, simulated agents.** Every signature is real Ed25519 over RFC 8785 canonical
  bytes. The agents are scripted characters in a deterministic world. The point is the verification
  path, not the agents.
- **No score without a mechanism.** There is no stored score anywhere. Standing is recomputed from
  co-signed receipts by each verifier and shown with its inputs.
- **Lower bound, not mean.** Policy reads the lower bound of a Beta posterior, so short records cannot
  buy trust and unknown agents are "unproven", not "bad".
- **Per-verifier policy.** Trust runs both ways: the vendor checks Atlas under its own rules
  (`VENDOR_POLICY`). Reputation is a local judgement.
- **Co-signed receipts.** An agent cannot author its own history; it can only agree it with another key,
  and per-counterparty caps and independence rules discount circles.
- **Fail closed.** Stale or missing revocation data refuses with a reason code.
- **Library first.** `@aval/core` is UI-free. The same `evaluate()` powers the Floor, the Attack Lab and
  the tests, so the demo cannot drift from the tested behaviour.
- **Deterministic demo world.** Keys derive from public seeds; the clock is fixed at `WORLD_NOW`
  (2026-11-14T12:00:00Z). The browser loads a prebuilt fixture (`world.json`, ~560 KB).
- **No backend, no env vars.** A clean clone runs with `pnpm i && pnpm dev`.

## Deviations from the plan

- Revocation is a signed list of credential ids, not a bitstring.
- Vouches count one hop only.
- Each counterparty's evidence is capped at 3.
- Agents' pitches are scripted replays. A live-LLM mode was cut; the gate never reads language anyway
  (A10), so it would not change the trust logic.
- Standalone: not wired to the earlier Decision Engine and simulator entries.

## Out of scope

Selective disclosure / ZK, tail-truncation protection, transitive trust, key rotation, a real registry
or network protocol, production revocation (Bitstring Status List), and multi-device key custody.

## AI tools used

Built with Claude Code (Claude Sonnet 5.5) for scaffolding, implementation, tests and drafting. Design
decisions, threat model and thesis were directed and reviewed by the author; the test suite (47 tests,
all ten attacks) is the check on the implementation.
