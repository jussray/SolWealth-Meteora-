import assert from "node:assert/strict";
import test from "node:test";

import { DBC_CONFIG_ACCOUNT_TYPES } from "../src/cognition/dbc-account-types.mjs";
import { DiscoveryQuorum } from "../src/cognition/discovery-quorum.mjs";
import { METEORA_DBC_PROGRAM_ID } from "../src/environments/meteora-dbc-sim.mjs";

const A = "11111111111111111111111111111111";
const B = "SysvarRent111111111111111111111111111111111";

function programAccountsFetch({ a = [A], b = [A] } = {}) {
  return async (endpoint, options) => {
    const request = JSON.parse(options.body);
    assert.equal(request.method, "getProgramAccounts");
    const addresses = endpoint.includes("rpc-a") ? a : b;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        result: addresses.map((pubkey) => ({ pubkey, account: {} })),
      }),
    };
  };
}

test("discovery quorum verifies only when two providers choose the same candidate identity", async () => {
  const quorum = new DiscoveryQuorum({
    endpoints: ["https://rpc-a.example", "https://rpc-b.example"],
    fetchFn: programAccountsFetch(),
    rpcOptions: { retries: 0, minRequestIntervalMs: 0 },
  });
  const result = await quorum.discover(METEORA_DBC_PROGRAM_ID, DBC_CONFIG_ACCOUNT_TYPES);

  assert.equal(result.status, "VERIFIED");
  assert.equal(result.address, A);
  assert.equal(result.accountType, "PoolConfig");
  assert.equal(result.agreeingProviderCount, 2);
  assert.equal(result.providerAgreementVerified, true);
  assert.equal(result.candidateSelectionIsEvidence, false);
  assert.equal(result.authorityChanged, false);
  assert.equal(result.transactionSigned, false);
  assert.equal(result.transactionSubmitted, false);
  assert.equal(result.realMoney, false);
});

test("discovery quorum fails closed on conflicting provider candidate choices", async () => {
  const quorum = new DiscoveryQuorum({
    endpoints: ["https://rpc-a.example", "https://rpc-b.example"],
    fetchFn: programAccountsFetch({ a: [A], b: [B] }),
    rpcOptions: { retries: 0, minRequestIntervalMs: 0 },
  });
  const result = await quorum.discover(METEORA_DBC_PROGRAM_ID, DBC_CONFIG_ACCOUNT_TYPES);

  assert.equal(result.status, "CONFLICT");
  assert.equal(result.address, null);
  assert.equal(result.agreeingProviderCount, 0);
  assert.equal(result.providerAgreementVerified, false);
  assert.equal(result.observations.filter((entry) => entry.status === "DISCOVERED").length, 2);
});

test("discovery quorum remains insufficient when fewer than two providers discover a candidate", async () => {
  const quorum = new DiscoveryQuorum({
    endpoints: ["https://rpc-a.example", "https://rpc-b.example"],
    fetchFn: programAccountsFetch({ a: [A], b: [] }),
    rpcOptions: { retries: 0, minRequestIntervalMs: 0 },
  });
  const result = await quorum.discover(METEORA_DBC_PROGRAM_ID, DBC_CONFIG_ACCOUNT_TYPES);

  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.address, null);
  assert.equal(result.discoveredProviderCount, 1);
  assert.equal(result.providerAgreementVerified, false);
});
