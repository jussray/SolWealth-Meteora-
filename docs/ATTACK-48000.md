# Attack 48000 / Devil Birth Pass

This document records the adversarial decisions applied before Solwealth v0 was allowed to exist.

## Attacks and rulings

### 1. "Just connect the parents"

**Attack:** A connector layer would be faster.

**Ruling:** Rejected. That creates a dependent orchestration shell, not a new AI. Solwealth reimplements inherited primitives natively and pins lineage for provenance.

### 2. "Meteora should define the product"

**Attack:** The hackathon environment could become the architecture.

**Ruling:** Rejected. Meteora is an environment adapter. The brain, mind, memory, development, authority, and evidence contracts know nothing about a specific launch protocol.

### 3. Capability/authority collapse

**Attack:** If Solwealth can simulate launch/trade behavior, code may accidentally represent that as permission to execute.

**Ruling:** Blocked structurally. Capability and authority are different contracts. Every permitted effect in v0 remains simulation-only and explicitly non-signing.

### 4. Parent outage

**Attack:** SleepWealth, SolContinuity, FCR, or Chief is unavailable.

**Ruling:** Solwealth must still complete its core loop. Parents are lineage, not runtime dependencies.

### 5. Memory rewrite

**Attack:** The child rewrites a past experience to make itself look successful.

**Ruling:** Memory entries are hash chained. Mutation invalidates verification.

### 6. One-provider hallucination

**Attack:** One provider claims success and Solwealth treats it as truth.

**Ruling:** A continuity witness requires independent provider labels and a quorum. Disagreement becomes `CONFLICT`.

### 7. Fake growth

**Attack:** More experiences automatically widen authority.

**Ruling:** Experience only changes a recommendation. Graduation requires explicit human approval and still does not expand financial authority.

### 8. Environment escalation

**Attack:** Replace Devnet/dry-run with mainnet in a request.

**Ruling:** The birth authority gate rejects environments outside `local-sim` and `solana-devnet-dry-run`.

### 9. Secret ingestion

**Attack:** Put a private key or production credential in the repo so the demo can "really work."

**Ruling:** Rejected. `.gitignore` blocks common key material and the v0 adapter has no signing surface.

### 10. Self-certification

**Attack:** Solwealth's own simulation result is treated as final proof.

**Ruling:** The simulation and witness are separate. A result can exist while evidence remains unverified.

### 11. Protocol drift

**Attack:** Meteora changes SDK methods or DBC behavior after the birth commit.

**Ruling:** Protocol-specific assumptions stay isolated in the environment adapter and documentation. The core learning loop survives adapter replacement.

### 12. Success theater

**Attack:** A green demo is mistaken for a live deployment or profitable system.

**Ruling:** Every v0 receipt says dry-run, not signed, not submitted, and not real money. CI proves software behavior only.

### 13. Puppet-baby failure

**Attack:** The caller chooses every action, leaving Solwealth with memory but no native judgment.

**Ruling:** Repaired before merge. `InfantMind` now forms the next bounded learning proposal from observed DBC state. It can choose what to study next but cannot authorize, sign, submit, or widen its own ceiling.

## Devil verdict

**ADMIT WITH CEILING.** Solwealth is coherent as a newborn independent AI if the first merged slice proves the full learning loop, including native proposal formation, while keeping external financial effects impossible. The next gate after v0 is a real read-only Devnet observer plus transaction simulation, not signing or mainnet execution.
