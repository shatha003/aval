# Architecture

Four layers. Each answers one question and cannot do the next layer's job.

| Layer | Question | Mechanism |
|---|---|---|
| **Identity** | Who is this? | `did:key` Ed25519. The key is the name; no registry. Proven live by signing a verifier-issued nonce. |
| **Claims** | What is asserted, and by whom else? | `AuthorityGrant`, `Attestation` (vouch), `InteractionReceipt`. All signed. |
| **Verification** | Is any of it true? | Canonical-byte signature checks, trust-anchor chain, validity window, revocation, attenuation, holder binding, history integrity. |
| **Policy** | Given the proven facts, what do I do? | Beta-posterior standing, tiered by task value, per verifier. Output: verdict, reasons, conditions, signed. |

## Data model

- **AuthorityGrant**: issuer → subject. Scopes (`action`, optional `maxValue`), `validFrom/Until`,
  `remainingDepth`, optional `parent`. Delegation must be a strict subset of the parent on every axis.
- **Attestation**: a vouch with a claim, weight and evidence.
- **InteractionReceipt**: requester, provider, task, value, outcome, per-party `prev` pointers (a hash
  chain per participant). Valid only with **both** signatures over the same bytes.
- **RevocationList**: issuer-signed list of revoked credential ids with `issuedAt`.
- **Presentation**: holder-signed bundle (grants, vouches, receipts) whose proof carries the verifier's
  `challenge` and `domain`.
- **DecisionReceipt**: the evaluator's signed verdict, the ten-stage trace, reasons and conditions,
  chained to the evaluator's previous decision (`DecisionLog`).

All ids are content hashes (`urn:aval:<kind>:<sha256>`); all proofs are `eddsa-jcs-2022`.

## The ten stages

| # | Question | Fails with |
|---|---|---|
| 1 | Who is this? | `UNRESOLVABLE_DID`, `UNRESOLVABLE_KEY` |
| 2 | Are the signatures real? | `CREDENTIAL_SIG_INVALID` |
| 3 | Does authority trace to someone I trust? | `ISSUER_NOT_TRUSTED` |
| 4 | Is it in date? | `EXPIRED`, `NOT_YET_VALID` |
| 5 | Has it been revoked? (fail closed) | `CREDENTIAL_REVOKED`, `REVOCATION_STALE` |
| 6 | Does delegation only narrow? | `DELEGATION_ESCALATION` |
| 7 | Can they prove it's theirs? | `HOLDER_MISMATCH`, `CHALLENGE_REPLAYED` |
| 8 | Is the history unbroken? | `RECEIPT_SIG_INVALID`, `HISTORY_BROKEN`, `HISTORY_FORK` |
| 9 | What is their standing? | (computed, not a pass/fail) |
| 10 | What does my policy say? | `INSUFFICIENT_STANDING`, `VALUE_ABOVE_POLICY`, `UNPROVEN_STANDING`, `POOR_HISTORY` |

The first failing stage ends the run; later stages are reported as *not reached*. Stages 1–8 are pure
verification. Only 9–10 involve judgement, and only 10 involves the verifier's own rules.

## Standing

Per counterparty, evidence is capped at 3 receipts, so volume with one partner cannot manufacture
reputation. Receipts are time-decayed. Successes and failures feed a Beta posterior; **policy reads the
95% lower bound**, not the mean, so a short lucky record cannot buy trust. A vouch adds weight scaled by
the *voucher's* independent standing, computed without the subject and without fellow vouchers, one hop
only.

## Policy

`PROCUREMENT_POLICY` (Atlas buying): ≤$500 needs lower bound 0.5 and 3 counterparties; ≤$5,000 needs 0.75
and 5; ≤$25,000 needs 0.88 and 8. Probation: ≤$500 with 50% escrow for unproven-but-credentialed agents.
`VENDOR_POLICY` (a vendor deciding whether to take Atlas's task) is a different rulebook over the same
evidence. Trust runs both ways, and each side applies its own policy.

## Why a model never touches the gate

The gate is deterministic code that reads structured, signed data only. Natural language (an agent's
pitch, a prompt injection) never reaches it. See attack A10.
