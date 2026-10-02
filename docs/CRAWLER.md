# Solwealth Crawler Phase

Crawler is Solwealth's first live-perception stage. It adds real read-only Solana Devnet observation and unsigned transaction simulation without widening financial authority.

## Truth boundary

- Network: Solana Devnet only.
- Default RPC: the public Solana Devnet endpoint.
- DBC program: Meteora Dynamic Bonding Curve program identity already pinned by the birth environment.
- No private keys, wallet secrets, signing methods, `sendTransaction`, mainnet path, or real-money execution surface exists in this lane.
- `simulateTransaction` is used only as an RPC simulation. A response may contain an execution error and still be a valid learning observation.
- One RPC endpoint is one provider. Repeated requests to the same endpoint never become quorum.

## Crawler loop

`LIVE OBSERVE -> CLUSTER IDENTITY -> PROGRAM STATE -> WITNESS -> ORIENT -> SELF-PROPOSE -> HUMAN GATE -> UNSIGNED SIMULATION -> WITNESS -> REFLECT -> LEARN -> MEMORY`

With only the default public endpoint, provider witness status is expected to remain `INSUFFICIENT_EVIDENCE`. Two or more separately configured endpoints may satisfy the existing continuity quorum only when their normalized observations agree.

## Development rule

Only provider-verified experiences count toward developmental graduation floors. An unverified live experience is still remembered and analyzed, but it does not promote Solwealth from newborn to crawler by itself.

## Optional pool observation

Set `SOLWEALTH_DBC_POOL` to a public Devnet DBC pool address to add read-only account ownership observation. Solwealth still does not create, sign, submit, fund, trade, or transfer anything through this lane.
