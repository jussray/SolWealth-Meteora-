# Meteora DBC as Solwealth's First Environment

Meteora is the first learning environment, not Solwealth's identity.

Current official DBC material describes a flow where a partner creates a reusable configuration, a creator creates a virtual pool, the pool trades along the configured bonding curve, and qualified pools migrate to DAMM v2. The official TypeScript SDK exposes configuration, pool creation, quotes, swaps, migration, and state reads.

The DBC program ID documented for both mainnet and devnet is:

`dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`

## Birth-slice scope

Solwealth v0 models four DBC-shaped actions:

- `create_config_plan`
- `create_pool_plan`
- `quote_swap_plan`
- `inspect_migration_plan`

They are dry-run learning actions. The birth slice intentionally does not sign or submit transactions.

## Why this boundary exists

A baby AI needs experience before external-effect authority. The first milestone is proving that Solwealth can:

1. observe an environment,
2. orient to risk and uncertainty,
3. propose a bounded action,
4. wait for human approval,
5. run a simulation,
6. independently classify evidence,
7. reflect on the outcome,
8. retain a tamper-evident memory.

A later Devnet adapter can replace simulated provider observations with real read-only Devnet state and transaction simulation while preserving this same contract.

## Primary references

- https://github.com/MeteoraAg/docs/blob/main/developer-guides/dbc/index.mdx
- https://github.com/MeteoraAg/dynamic-bonding-curve-sdk
- https://github.com/MeteoraAg/dynamic-bonding-curve-sdk/blob/main/packages/dynamic-bonding-curve/README.md
