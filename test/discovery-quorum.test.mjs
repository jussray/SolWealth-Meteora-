import assert from "node:assert/strict";
import test from "node:test";

import { DBC_CONFIG_ACCOUNT_TYPES } from "../src/cognition/dbc-account-types.mjs";
import { DiscoveryQuorum } from "../src/cognition/discovery-quorum.mjs";
import { METEORA_DBC_PROGRAM_ID } from "../src/environments/meteora-dbc-sim.mjs";

const A = "11111111111111111111111111111111";
const B = "SysvarRent111111111111111111111111111111111";
const C = "SysvarC1ock11111111111111111111111111111111";

function programAccountsFetch(candidatesByProvider = {}) {
  return async (endpoint, options) => {
    const request = JSON.parse(options.body);
    assert.equal(request.method, "getProgramAccounts");
    const providerName = ["rpc-a", "rpc-b", "rpc-c", "rpc-d"].find((name) => endpoint.includes(name));
    const addresses = candidatesByProvider[providerName] ?? [];
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        result: addresses.map((pubkey) => ({ pubkey, account: {} })),
      }),
    };
  };
}

function quorum({ endpoints = ["https://rpc-a.example", "https://rpc-b.example"], candidatesByProvider }) {
  return new DiscoveryQuorum({
    endpoints,
    fetchFn: programAccountsFetch(candidatesByProvider),
    rpcOptions: { retries: 0, minRequestIntervalMs: 0 },
  });
}

test("discovery quorum verifies a deterministic candidate present in both provider sets", async () => {
  const result = await quorum({
    candidatesByProvider: {
      "rpc-a": [A, B],
      "rpc-b": [A, B],
    },
  }).discover(METEORA_DBC_PROGRAM_ID, DBC_CONFIG_ACCOUNT_TYPES);

  assert.equal(result.status, "VERIFIED");
  assert.equal(result.address, A);
  assert.equal(result.accountType, "PoolConfig");
  assert.equal(result.agreeingProviderCount, 2);
  assert.equal(result.commonCandidateCount, 2);
  assert.equal(result.providerAgreementVerified, true);
  assert.equal(result.candidateSelectionIsEvidence, false);
  assert.equal(result.authorityChanged, false);
  assert.equal(result.transactionSigned, false);
  assert.equal(result.transactionSubmitted, false);
  assert.equal(result.realMoney, false);
});

test("discovery quorum uses provider-set intersection instead of conflicting on different first candidates", async () => {
  const result = await quorum({
    candidatesByProvider: {
      "rpc-a": [A, B],
      "rpc-b": [B, C],
    },
  }).discover(METEORA_DBC_PROGRAM_ID, DBC_CONFIG_ACCOUNT_TYPES);

  assert.equal(result.status, "VERIFIED");
  assert.equal(result.address, B);
  assert.equal(result.commonCandidateCount, 1);
  assert.equal(result.agreeingProviderCount, 2);
});

test("discovery quorum fails closed when provider candidate sets are disjoint", async () => {
  const result = await quorum({
    candidatesByProvider: {
      "rpc-a": [A],
      "rpc-b": [B],
    },
  }).discover(METEORA_DBC_PROGRAM_ID, DBC_CONFIG_ACCOUNT_TYPES);

  assert.equal(result.status, "CONFLICT");
  assert.equal(result.address, null);
  assert.equal(result.agreeingProviderCount, 0);
  assert.equal(result.providerAgreementVerified, false);
});

test("discovery quorum remains insufficient when fewer than two providers discover candidates", async () => {
  const result = await quorum({
    candidatesByProvider: {
      "rpc-a": [A],
      "rpc-b": [],
    },
  }).discover(METEORA_DBC_PROGRAM_ID, DBC_CONFIG_ACCOUNT_TYPES);

  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.address, null);
  assert.equal(result.discoveredProviderCount, 1);
  assert.equal(result.providerAgreementVerified, false);
});

test("discovery quorum rejects a two-versus-two split with no candidate common to all discovered providers", async () => {
  const result = await quorum({
    endpoints: [
      "https://rpc-a.example",
      "https://rpc-b.example",
      "https://rpc-c.example",
      "https://rpc-d.example",
    ],
    candidatesByProvider: {
      "rpc-a": [A],
      "rpc-b": [A],
      "rpc-c": [B],
      "rpc-d": [B],
    },
  }).discover(METEORA_DBC_PROGRAM_ID, DBC_CONFIG_ACCOUNT_TYPES);

  assert.equal(result.status, "CONFLICT");
  assert.equal(result.address, null);
  assert.equal(result.discoveredProviderCount, 4);
  assert.equal(result.agreeingProviderCount, 0);
  assert.equal(result.providerAgreementVerified, false);
});
