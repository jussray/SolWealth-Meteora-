import assert from "node:assert/strict";
import test from "node:test";

import {
  ContinuityWitness,
  METEORA_DBC_PROGRAM_ID,
  MeteoraDbcCrawler,
  SOLANA_DEVNET_GENESIS_HASH,
  SolanaDevnetRpc,
  SolwealthBabyAI,
  buildUnsignedProgramProbe,
  decodeBase58,
} from "../src/index.mjs";

function fakeFetch(endpoint, options) {
  const request = JSON.parse(options.body);
  const slot = endpoint.includes("rpc-a") ? 100 : 101;
  let result;
  switch (request.method) {
    case "getGenesisHash":
      result = SOLANA_DEVNET_GENESIS_HASH;
      break;
    case "getSlot":
      result = slot;
      break;
    case "getVersion":
      result = { "solana-core": "2.3.3" };
      break;
    case "getAccountInfo":
      result = {
        context: { slot },
        value: {
          data: ["", "base64"],
          executable: true,
          lamports: 1,
          owner: "BPFLoaderUpgradeab1e11111111111111111111111",
          rentEpoch: 0,
          space: 36,
        },
      };
      break;
    case "getLatestBlockhash":
      result = {
        context: { slot },
        value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 999 },
      };
      break;
    case "simulateTransaction":
      result = {
        context: { slot },
        value: {
          err: "InvalidAccountForFee",
          logs: [],
          unitsConsumed: 0,
        },
      };
      break;
    default:
      throw new Error(`Unexpected method: ${request.method}`);
  }
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: "2.0", id: 1, result }),
  });
}

test("base58 decoder and unsigned probe produce a non-signed legacy transaction envelope", () => {
  assert.equal(decodeBase58("11111111111111111111111111111111").length, 32);
  const encoded = buildUnsignedProgramProbe({
    programId: METEORA_DBC_PROGRAM_ID,
    recentBlockhash: "11111111111111111111111111111111",
  });
  const bytes = Buffer.from(encoded, "base64");
  assert.equal(bytes[0], 1);
  assert.equal(bytes.subarray(1, 65).equals(Buffer.alloc(64)), true);
});

test("two independent configured RPC observations can satisfy continuity quorum without comparing slots", async () => {
  const rpc = new SolanaDevnetRpc({
    endpoints: ["https://rpc-a.example", "https://rpc-b.example"],
    fetchFn: fakeFetch,
    retries: 0,
    minRequestIntervalMs: 0,
  });
  const observation = await rpc.observeProgram(METEORA_DBC_PROGRAM_ID);
  assert.equal(observation.clusterVerified, true);
  assert.equal(observation.programAccount.present, true);
  assert.equal(observation.programAccount.executable, true);
  assert.equal(observation.providerObservations.length, 2);
  const witness = new ContinuityWitness().verify(observation.providerObservations);
  assert.equal(witness.status, "VERIFIED");
});

test("a temporary HTTP 429 is paced and retried instead of silently losing a provider", async () => {
  let rateLimitResponses = 0;
  const recoveringFetch = async (endpoint, options) => {
    const request = JSON.parse(options.body);
    if (endpoint.includes("rpc-b") && request.method === "getGenesisHash" && rateLimitResponses === 0) {
      rateLimitResponses += 1;
      return {
        ok: false,
        status: 429,
        headers: { get: () => "0" },
        json: async () => ({}),
      };
    }
    return fakeFetch(endpoint, options);
  };

  const rpc = new SolanaDevnetRpc({
    endpoints: ["https://rpc-a.example", "https://rpc-b.example"],
    fetchFn: recoveringFetch,
    retries: 1,
    minRequestIntervalMs: 0,
    rateLimitBackoffMs: 1,
  });
  const observation = await rpc.observeProgram(METEORA_DBC_PROGRAM_ID);
  assert.equal(rateLimitResponses, 1);
  assert.equal(observation.observedProviderCount, 2);
  assert.equal(new ContinuityWitness().verify(observation.providerObservations).status, "VERIFIED");
});

test("single live provider remains insufficient evidence instead of self-certifying", async () => {
  const rpc = new SolanaDevnetRpc({
    endpoints: ["https://rpc-a.example"],
    fetchFn: fakeFetch,
    retries: 0,
    minRequestIntervalMs: 0,
  });
  const environment = new MeteoraDbcCrawler({ rpc });
  const baby = new SolwealthBabyAI({ environment });
  baby.birth();
  const observation = await baby.observeAsync();
  assert.equal(observation.observationWitness.status, "INSUFFICIENT_EVIDENCE");
  const thought = baby.think(observation.id);
  assert.equal(thought.decision.action, "simulate_program_probe");
  assert.equal(thought.decision.canSelfAuthorize, false);
  assert.equal(thought.orientation.warningFlags.includes("provider_quorum_not_met"), true);

  const blocked = await baby.experienceAsync(thought.proposal.id);
  assert.equal(blocked.status, "BLOCKED");
  assert.equal(blocked.permit.reason, "human_approval_required");

  const experience = await baby.experienceAsync(thought.proposal.id, { approved: true, id: "human" });
  assert.equal(experience.status, "EXPERIENCED_UNVERIFIED");
  assert.equal(experience.simulation.transactionSigned, false);
  assert.equal(experience.simulation.transactionSubmitted, false);
  assert.equal(experience.simulation.realMoney, false);
  assert.equal(experience.witness.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(baby.development().recommendedStage, "newborn");

  await assert.rejects(
    baby.experienceAsync(thought.proposal.id, { approved: true, id: "human-again" }),
    /Proposal already experienced/,
  );

  const reflection = baby.reflect(experience);
  assert.equal(reflection.lesson, "experience_requires_more_evidence");
  const learning = baby.learn();
  assert.equal(learning.nextFocus, "gather_more_independent_evidence");
  assert.equal(learning.authorityChangeRecommended, false);
  assert.equal(baby.verifyMemory(), true);
});

test("RPC adapter exposes observation and simulation only, never signing or submission", () => {
  const rpc = new SolanaDevnetRpc({
    endpoints: ["https://rpc-a.example"],
    fetchFn: fakeFetch,
    retries: 0,
    minRequestIntervalMs: 0,
  });
  assert.equal(typeof rpc.sendTransaction, "undefined");
  assert.equal(typeof rpc.signTransaction, "undefined");
});
