import assert from "node:assert/strict";
import test from "node:test";

import {
  BoundedCognitionAdvisor,
  InfantMind,
  METEORA_DBC_PROGRAM_ID,
  MeteoraDbcCrawler,
  SolwealthBabyAI,
  compareObservedState,
} from "../src/index.mjs";

const CONFIG_ADDRESS = "Config11111111111111111111111111111111111";
const POOL_ADDRESS = "Pool1111111111111111111111111111111111111";

function stateTemplate({ configHash = "config-a", poolHash = "pool-a", slot = 100 } = {}) {
  return {
    environment: "solana-devnet-dry-run",
    dryRun: true,
    sourceMode: "live-readonly",
    programId: METEORA_DBC_PROGRAM_ID,
    clusterVerified: true,
    configState: {
      address: CONFIG_ADDRESS,
      observed: true,
      observedProviderCount: 2,
      present: true,
      ownedByDbcProgram: true,
      owner: METEORA_DBC_PROGRAM_ID,
      executable: false,
      space: 256,
      lamports: 1000,
      dataLength: 64,
      dataHash: configHash,
      slot,
    },
    poolState: {
      address: POOL_ADDRESS,
      observed: true,
      observedProviderCount: 2,
      present: true,
      ownedByDbcProgram: true,
      owner: METEORA_DBC_PROGRAM_ID,
      executable: false,
      space: 512,
      lamports: 2000,
      dataLength: 128,
      dataHash: poolHash,
      slot,
    },
  };
}

test("semantic novelty ignores slot churn but detects tracked account data changes", () => {
  const baseline = stateTemplate({ slot: 100 });
  const sameMeaningLater = stateTemplate({ slot: 999 });
  const changed = stateTemplate({ poolHash: "pool-b", slot: 1000 });

  const unchangedReceipt = compareObservedState(baseline, sameMeaningLater);
  assert.equal(unchangedReceipt.noveltyClass, "UNCHANGED");
  assert.deepEqual(unchangedReceipt.changedTargets, []);

  const changedReceipt = compareObservedState(sameMeaningLater, changed);
  assert.equal(changedReceipt.noveltyClass, "CHANGED");
  assert.deepEqual(changedReceipt.changedTargets, ["poolState"]);
  assert.equal(changedReceipt.changes[0].changedFields.includes("dataHash"), true);
});

test("model-backed cognition is advisory only and cannot smuggle authority or actions", () => {
  const advisor = new BoundedCognitionAdvisor({
    model: () => ({
      focus: "inspect_state_change",
      summary: "Inspect the verified state delta.",
      confidenceClass: "model-test",
      action: "sendTransaction",
      canSelfAuthorize: true,
      canSign: true,
      canSubmit: true,
      authorityChanged: true,
    }),
  });

  const observation = {
    observationWitness: { verified: true },
    change: { noveltyClass: "CHANGED" },
  };
  const advice = advisor.advise({ observation, orientation: {}, development: { stage: "newborn" } });

  assert.equal(advice.source, "model-constrained");
  assert.equal(advice.focus, "inspect_state_change");
  assert.equal(advice.canSelfAuthorize, false);
  assert.equal(advice.canSign, false);
  assert.equal(advice.canSubmit, false);
  assert.equal(advice.authorityChanged, false);
  assert.equal("action" in advice, false);
});

test("Baby fingerprints DBC config/pool changes and keeps the only live action bounded to unsigned simulation", async () => {
  let cycle = 0;
  const rpc = {
    async observeProgram(programId) {
      cycle += 1;
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
        providers: [
          { provider: "a", status: "OBSERVED" },
          { provider: "b", status: "OBSERVED" },
        ],
        providerObservations: [
          { provider: "a", state },
          { provider: "b", state },
        ],
      };
    },
    async observeAccount(address) {
      const dataHash = address === POOL_ADDRESS && cycle >= 2 ? "pool-b" : `${address}-a`;
      const state = {
        address,
        present: true,
        executable: false,
        owner: METEORA_DBC_PROGRAM_ID,
        space: address === POOL_ADDRESS ? 512 : 256,
        lamports: address === POOL_ADDRESS ? 2000 : 1000,
        dataLength: address === POOL_ADDRESS ? 128 : 64,
        dataHash,
        ownerMatches: true,
      };
      return {
        providers: [
          { provider: "a", status: "OBSERVED", ...state },
          { provider: "b", status: "OBSERVED", ...state },
        ],
        providerObservations: [
          { provider: "a", state },
          { provider: "b", state },
        ],
      };
    },
    async simulateProgramProbe(programId) {
      const state = {
        programId,
        rpcReached: true,
        simulationAccepted: true,
        errClass: "InvalidAccountForFee",
        programInvoked: false,
        transactionSigned: false,
        transactionSubmitted: false,
        realMoney: false,
      };
      return {
        status: "DEVNET_SIMULATION_OBSERVED",
        providerObservations: [
          { provider: "a", state },
          { provider: "b", state },
        ],
        simulations: [],
        simulationRpcContact: true,
        transactionSigned: false,
        transactionSubmitted: false,
        realMoney: false,
      };
    },
  };

  const advisor = new BoundedCognitionAdvisor({
    model: () => ({
      focus: "inspect_state_change",
      summary: "A pool account fingerprint changed.",
      confidenceClass: "model-test",
      action: "sendTransaction",
      canSelfAuthorize: true,
    }),
  });
  const environment = new MeteoraDbcCrawler({
    rpc,
    configAddress: CONFIG_ADDRESS,
    poolAddress: POOL_ADDRESS,
  });
  const baby = new SolwealthBabyAI({
    environment,
    mind: new InfantMind({ advisor }),
  });

  baby.birth();
  const first = await baby.observeAsync();
  assert.equal(first.change.noveltyClass, "BASELINE");
  assert.equal(first.trackedWitnesses.configState.status, "VERIFIED");
  assert.equal(first.trackedWitnesses.poolState.status, "VERIFIED");

  const second = await baby.observeAsync();
  assert.equal(second.change.noveltyClass, "CHANGED");
  assert.deepEqual(second.change.changedTargets, ["poolState"]);

  const thought = baby.think(second.id);
  assert.equal(thought.decision.action, "simulate_program_probe");
  assert.equal(thought.decision.cognition.source, "model-constrained");
  assert.equal(thought.decision.cognition.canSelfAuthorize, false);
  assert.equal(thought.decision.canSelfAuthorize, false);
  assert.equal(thought.decision.canSign, false);
  assert.equal(thought.decision.canSubmit, false);
  assert.equal(thought.proposal.capability, "simulate_devnet_transaction");

  const blocked = await baby.experienceAsync(thought.proposal.id);
  assert.equal(blocked.status, "BLOCKED");

  const experienced = await baby.experienceAsync(thought.proposal.id, { approved: true, id: "human" });
  assert.equal(experienced.status, "EXPERIENCED_VERIFIED");
  assert.equal(experienced.fingerprint.startsWith("xfp_"), true);
  assert.equal(experienced.simulation.transactionSigned, false);
  assert.equal(experienced.simulation.transactionSubmitted, false);
  assert.equal(experienced.simulation.realMoney, false);

  const learning = baby.learn();
  assert.equal(learning.changedObservations, 1);
  assert.equal(learning.nextFocus, "compare_verified_state_change");
  assert.equal(learning.authorityChangeRecommended, false);
  assert.equal(baby.verifyMemory(), true);
});
