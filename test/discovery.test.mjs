import assert from "node:assert/strict";
import test from "node:test";

import { DBC_CONFIG_ACCOUNT_TYPES } from "../src/cognition/dbc-account-types.mjs";
import { METEORA_DBC_PROGRAM_ID } from "../src/environments/meteora-dbc-sim.mjs";
import {
  SolanaDevnetRpc,
  decodeBase58,
  encodeBase58,
} from "../src/rpc/solana-devnet.mjs";

const DISCOVERED_ADDRESS = "11111111111111111111111111111111";

test("base58 encoder round-trips discriminator bytes including leading zeroes", () => {
  const bytes = Buffer.from("001a6c0e7b74e6812b", "hex");
  const encoded = encodeBase58(bytes);
  assert.equal(decodeBase58(encoded).equals(bytes), true);
});

test("read-only discovery uses an offset-zero discriminator filter and returns a candidate, not evidence", async () => {
  const expected = DBC_CONFIG_ACCOUNT_TYPES[0];
  const expectedFilter = encodeBase58(Buffer.from(expected.discriminatorHex, "hex"));
  let observedRequest = null;
  const fetchFn = async (_endpoint, options) => {
    const request = JSON.parse(options.body);
    observedRequest = request;
    assert.equal(request.method, "getProgramAccounts");
    assert.equal(request.params[0], METEORA_DBC_PROGRAM_ID);
    assert.equal(request.params[1].commitment, "confirmed");
    assert.deepEqual(request.params[1].dataSlice, { offset: 0, length: 0 });
    assert.deepEqual(request.params[1].filters, [{ memcmp: { offset: 0, bytes: expectedFilter } }]);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        result: [{ pubkey: DISCOVERED_ADDRESS, account: {} }],
      }),
    };
  };

  const rpc = new SolanaDevnetRpc({
    endpoints: ["https://rpc-a.example"],
    fetchFn,
    retries: 0,
    minRequestIntervalMs: 0,
  });
  const discovery = await rpc.discoverAccountByDiscriminator(
    METEORA_DBC_PROGRAM_ID,
    [expected],
  );

  assert.equal(observedRequest.method, "getProgramAccounts");
  assert.equal(discovery.status, "DISCOVERED");
  assert.equal(discovery.address, DISCOVERED_ADDRESS);
  assert.equal(discovery.accountType, "PoolConfig");
  assert.equal(discovery.candidateSelectionIsEvidence, false);
  assert.equal(discovery.authorityChanged, false);
  assert.equal(discovery.transactionSigned, false);
  assert.equal(discovery.transactionSubmitted, false);
  assert.equal(discovery.realMoney, false);
});

test("discovery fails closed when no matching account is found", async () => {
  const fetchFn = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: "2.0", id: 1, result: [] }),
  });
  const rpc = new SolanaDevnetRpc({
    endpoints: ["https://rpc-a.example", "https://rpc-b.example"],
    fetchFn,
    retries: 0,
    minRequestIntervalMs: 0,
  });
  const discovery = await rpc.discoverAccountByDiscriminator(
    METEORA_DBC_PROGRAM_ID,
    DBC_CONFIG_ACCOUNT_TYPES,
  );

  assert.equal(discovery.status, "NOT_FOUND");
  assert.equal(discovery.address, null);
  assert.equal(discovery.candidateSelectionIsEvidence, false);
  assert.equal(discovery.authorityChanged, false);
  assert.equal(discovery.attempts.every((attempt) => attempt.status === "OBSERVED"), true);
});
