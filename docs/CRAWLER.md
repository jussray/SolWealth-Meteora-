# Solwealth Crawler Phase

Crawler is Solwealth's first live-perception stage. It adds real read-only Solana Devnet observation and unsigned transaction simulation without widening financial authority.

## Truth boundary

- Network: Solana Devnet only.
- Runtime default RPC: the public Solana Devnet endpoint.
- Verification profile: two independent public Devnet provider surfaces, Solana's public endpoint plus Ankr's Devnet endpoint, as listed by Solana's RPC infrastructure directory.
- DBC program: Meteora Dynamic Bonding Curve program identity already pinned by the birth environment.
- No private keys, wallet secrets, signing methods, `sendTransaction`, mainnet path, or real-money execution surface exists in this lane.
- `simulateTransaction` is used only as an RPC simulation. A response may contain an execution error and still be a valid learning observation.
- One RPC endpoint is one provider. Repeated requests to the same endpoint never become quorum.
- Provider URLs are reduced to hashed provider IDs in receipts so credential-bearing URLs can be supplied later without leaking them.

## Crawler loop

`LIVE OBSERVE -> CLUSTER IDENTITY -> PROGRAM STATE -> WITNESS -> ORIENT -> SELF-PROPOSE -> HUMAN GATE -> UNSIGNED SIMULATION -> WITNESS -> REFLECT -> LEARN -> MEMORY`

The normal runtime stays usable with one endpoint and truthfully reports `INSUFFICIENT_EVIDENCE`. The CI verification profile deliberately supplies two independently operated Devnet RPC surfaces. Solwealth may count the live experience as verified only if their normalized program and simulation observations agree.

## Development rule

Only provider-verified experiences count toward developmental graduation floors. Reaching the crawler recommendation does not change authority and does not silently graduate the baby. Human approval remains a separate gate.

## Optional pool observation

Set `SOLWEALTH_DBC_POOL` to a public Devnet DBC pool address to add read-only account ownership observation. Solwealth still does not create, sign, submit, fund, trade, or transfer anything through this lane.

## Evidence sources

- Solana RPC infrastructure directory: https://solana.com/rpc
- Solana Devnet cluster endpoint documentation: https://solana.com/docs/references/clusters
