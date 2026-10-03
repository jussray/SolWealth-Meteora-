import assert from "node:assert/strict";
import test from "node:test";

import {
  DBC_CONFIG_ACCOUNT_TYPES,
  DBC_POOL_ACCOUNT_TYPES,
  anchorAccountDiscriminatorHex,
} from "../src/cognition/dbc-account-types.mjs";
import { METEORA_DBC_PROGRAM_ID } from "../src/environments/meteora-dbc-sim.mjs";
import { MeteoraDbcCrawler } from "../src/environments/meteora-dbc-crawler.mjs";
import { SolwealthBabyAI } from "../src/brain.mjs";
import { SolanaDevnetRpc } from "../src/rpc/solana-devnet.mjs";

const CONFIG_ADDRESS = "Config11111111111111111111111111111111111";

function accountBytes(accountName, payload = "test") {
  return Buffer.concat([
    Buffer.from(anchorAccountDiscriminatorHex(accountName), "hex"),
    Buffer.from(payload),
  ]).toString("base64");
}

function accountFetch(accountName) {
  return async (_endpoint, options) => {
    const request = JSON.parse(options.body);
    if (request.method !== "getAccountInfo") throw new Error(`Unexpected method: ${request.method}`);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        result: {
          context: { slot: 100 },
          value: {
            data: [accountBytes(accountName), "base64"],
            executable: false,
            lamports: 123,
            owner: METEORA_DBC_PROGRAM_ID,
            rentEpoch: 0,
            space: 64,
          },
        },
      }),
    };
  };
}

test("Anchor-derived discriminators match current Meteora IDL account prefixes", () => {
  assert.equal(anchorAccountDiscriminatorHex("PoolConfig"), "1a6c0e7b74e6812b");
  assert.equal(anchorAccountDiscriminatorHex("VirtualPool"), "d5e005d16245775c");
  assert.equal(DBC_CONFIG_ACCOUNT_TYPES.some((entry) => entry.name === "ConfigWithTransferHook"), true);
  assert.equal(DBC_POOL_ACCOUNT_TYPES.some((entry) => entry.name === "TransferHookPool"), true);
});

test("RPC classifies a DBC PoolConfig without exposing raw account bytes", async () => {
  const rpc = new SolanaDevnetRpc({
    endpoints: ["https://rpc-a.example", "https://rpc-b.example"],
    fetchFn: accountFetch("PoolConfig"),
    retries: 0,
    minRequestIntervalMs: 0,
  });
  const observation = await rpc.observeAccount(CONFIG_ADDRESS, {
    expectedOwner: METEORA_DBC_PROGRAM_ID,
    expectedDiscriminators: DBC_CONFIG_ACCOUNT_TYPES,
  });
  assert.equal(observation.observedProviderCount, 2);
  for (const provider of observation.providerObservations) {
    assert.equal(provider.state.ownerMatches, true);
    assert.equal(provider.state.accountType, "PoolConfig");
    assert.equal(provider.state.accountTypeMatches, true);
    assert.equal(provider.state.discriminatorHex, "1a6c0e7b74e6812b");
    assert.equal("rawData" in provider.state, false);
  }
});

test("correct program owner with the wrong DBC account discriminator halts cognition", async () => {
  const stateFor = (accountTypeMatches) => ({
    address: CONFIG_ADDRESS,
    present: true,
    executable: false,
    owner: METEORA_DBC_PROGRAM_ID,
    space: 64,
    lamports: 123,
    dataLength: 12,
    dataHash: "hash",
    discriminatorHex: anchorAccountDiscriminatorHex("VirtualPool"),
    accountType: null,
    accountTypeMatches,
    ownerMatches: true,
  });
  const rpc = {
    async observeProgram(programId) {
      const state = {
        network: "solana-devnet",
        genesisHash: "devnet",
        programId,
        programPresent: true,
        programExecutable: true,
        programOwner: "loader",
        programSpace: 36,
      };
      return {
        clusterVerified: true,
        configuredProviderCount: 2,
        observedProviderCount: 2,
        providerFailureCount: 0,
        programAccount: { present: true, executable: true },
        providers: [{ provider: "a", status: "OBSERVED" }, { provider: "b", status: "OBSERVED" }],
        providerObservations: [{ provider: "a", state }, { provider: "b", state }],
      };
    },
    async observeAccount() {
      return {
        providers: [{ provider: "a", status: "OBSERVED" }, { provider: "b", status: "OBSERVED" }],
        providerObservations: [
          { provider: "a", state: stateFor(false) },
          { provider: "b", state: stateFor(false) },
        ],
      };
    },
    async simulateProgramProbe() {
      throw new Error("simulation must never be reached after account identity halt");
    },
  };

  const baby = new SolwealthBabyAI({
    environment: new MeteoraDbcCrawler({ rpc, configAddress: CONFIG_ADDRESS }),
  });
  baby.birth();
  const observation = await baby.observeAsync();
  assert.equal(observation.state.configState.ownedByDbcProgram, true);
  assert.equal(observation.state.configState.accountTypeMatches, false);
  const thought = baby.think(observation.id);
  assert.equal(thought.orientation.riskFlags.includes("configState_account_type_mismatch"), true);
  assert.equal(thought.orientation.disposition, "HALT");
  assert.equal(thought.proposal, null);
});
