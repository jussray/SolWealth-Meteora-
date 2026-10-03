# Solwealth Persistent Memory v1

Solwealth memory can now survive a process restart without restoring stale authority.

## Contract

1. Memory entries remain hash-chained.
2. The persisted ledger is paired with a separate continuity anchor containing the expected entry count and terminal hash.
3. Rewritten payloads fail hash-chain verification.
4. A truncated but internally valid prefix fails against the newer anchor.
5. Missing ledger/anchor halves fail closed.
6. Verified developmental experience is reconstructed from memory after restart.
7. Pending proposals, approvals, signing authority, and effect authority are never restored by memory recovery.

## Local-anchor limitation

The v1 anchor is a separate local file. It detects accidental corruption, partial writes, one-sided truncation, and rollback when the anchor survives. It is not a defense against an attacker who can rewrite both the ledger and anchor together. A later continuity layer can root the anchor in an independent external witness without changing the memory contract.

## Restart proof

`npm run memory:restart` launches two separate Node processes. The first process creates verified developmental history and exits. The second process reopens the ledger, validates the anchor, reconstructs development, emits a `RESUME` receipt, and proves that no old approval or pending proposal came back to life.
