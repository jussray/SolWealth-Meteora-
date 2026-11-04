# Claude session state — SolWealth-Meteora-

## 2026-11-04 — Account-scope port and dry-run Solana posture

- REALITY @ `ddbfdb1` on `claude/ai-runtime-repos-automation-uhpoz6`: dry-run and Devnet only. No signing, broadcast, wallet or custody code exists. `authority.mjs` allows only `local-sim` and `solana-devnet-dry-run`, and denies mainnet. VERIFIED by reading the code and the remote head.
- FIX (this session):
  - `a349a46` dry-run AI proposal seam (`src/runtime/ai-dry-run.mjs`). Checks shape, rejects secret, signing, broadcast and money params (including nested), and sends the result to `AuthorityGate`. Approval comes only from the caller.
  - `ddbfdb1` account-scope evaluator (`src/accounts/account-scope.mjs`). Ported from SleepWealth. A cross-language test vector checks its HMAC signature against the Python evaluator.
- PROOF: `npm test` = 49 passed. CI runs `npm test`.
- RISK: no Solana custody model is chosen. Customer-connected (non-custodial) and pooled (custodial) need different legal and technical paths. Until one is chosen, nothing should sign or broadcast.
- ROLLBACK: revert `ddbfdb1` and `a349a46`.
- NEXT GATE (founder decisions):
  1. Choose the Solana model: non-custodial customer wallets, or pooled custody.
  2. Confirm FCR as the trusted receipt issuer and provision its key.
  3. If customer wallets: specify the signing flow, which stays with the customer's wallet.
