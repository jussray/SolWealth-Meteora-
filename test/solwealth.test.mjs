import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthorityGate,
  BIRTH_LINEAGE,
  ContinuityWitness,
  DevelopmentState,
  MemoryLedger,
  MeteoraDbcLab,
  SolwealthBabyAI,
} from "../src/index.mjs";

test("birth lineage pins established parent SHAs without runtime dependency", () => {
  const bySystem = Object.fromEntries(BIRTH_LINEAGE.parents.map((parent) => [parent.system, parent]));
  assert.equal(bySystem["SleepWealth-Agent"].sha, "5ee4a05c3db6d838f29c9e299d2f6317bcf39064");
  assert.equal(bySystem.SolContinuity.sha, "2225bcde284e0de010f7c35858f68ec28d2eeebc");
  assert.equal(BIRTH_LINEAGE.inheritanceMode, "primitive-not-runtime-dependency");
});

test("authority gate blocks mainnet and never grants real-money authority", () => {
  const gate = new AuthorityGate();
  const mainnet = gate.authorize({
    capability: "simulate_trade",
    environment: "solana-mainnet",
    approval: { approved: true },
  });
  assert.equal(mainnet.status, "DENIED");
  assert.equal(mainnet.authorizesRealMoney, false);

  const devnet = gate.authorize({
    capability: "simulate_trade",
    environment: "solana-devnet-dry-run",
    approval: { approved: true, id: "human" },
  });
  assert.equal(devnet.status, "PERMITTED");
  assert.equal(devnet.effectClass, "simulation_only");
  assert.equal(devnet.authorizesExternalEffect, false);
  assert.equal(devnet.authorizesSigning, false);
});

test("simulation capability cannot execute without explicit human approval", () => {
  const baby = new SolwealthBabyAI({ environment: new MeteoraDbcLab() });
  baby.birth();
  const observation = baby.observe();
  const orientation = baby.orient(observation.id);
  const proposal = baby.propose({
    observationId: observation.id,
    orientationId: orientation.id,
    action: "create_pool_plan",
  });
  const experience = baby.experience(proposal.id);
  assert.equal(experience.status, "BLOCKED");
  assert.equal(experience.permit.reason, "human_approval_required");
});

test("baby completes end-to-end approved dry-run, witness, reflection, and memory", () => {
  const baby = new SolwealthBabyAI({ environment: new MeteoraDbcLab() });
  baby.birth();
  const observation = baby.observe({ quoteReserve: 0 });
  const orientation = baby.orient(observation.id);
  assert.equal(orientation.disposition, "LEARN");
  const proposal = baby.propose({
    observationId: observation.id,
    orientationId: orientation.id,
    action: "create_pool_plan",
    params: { tokenSymbol: "BABY" },
  });
  const experience = baby.experience(proposal.id, { approved: true, id: "human-proof" });
  assert.equal(experience.status, "EXPERIENCED_VERIFIED");
  assert.equal(experience.simulation.publicState.transactionSigned, false);
  assert.equal(experience.simulation.publicState.transactionSubmitted, false);
  assert.equal(experience.simulation.publicState.realMoney, false);
  assert.equal(experience.witness.status, "VERIFIED");
  const reflection = baby.reflect(experience);
  assert.equal(reflection.lesson, "dry_run_result_was_consistently_observed");
  assert.equal(baby.verifyMemory(), true);
  assert.equal(baby.development().experiences, 1);
  assert.equal(baby.development().recommendedStage, "crawler");
});

test("memory ledger detects rewritten developmental history", () => {
  const ledger = new MemoryLedger({ clock: () => "2026-10-01T20:00:00-04:00" });
  ledger.append("BIRTH", { baby: "solwealth" });
  ledger.append("EXPERIENCE", { result: "learned" });
  const copied = ledger.entries();
  copied[0].payload.baby = "rewritten";
  assert.equal(ledger.verify(copied), false);
  assert.equal(ledger.verify(), true);
});

test("continuity witness fails closed on provider disagreement", () => {
  const witness = new ContinuityWitness();
  const result = witness.verify([
    { provider: "a", state: { slot: 1, status: "ok" } },
    { provider: "b", state: { slot: 2, status: "ok" } },
  ]);
  assert.equal(result.status, "CONFLICT");
  assert.equal(result.verified, false);
});

test("development never self-expands authority", () => {
  const development = new DevelopmentState();
  development.recordExperience();
  const denied = development.graduate("crawler", { approved: false });
  assert.equal(denied.status, "DENIED");
  const graduated = development.graduate("crawler", { approved: true });
  assert.equal(graduated.status, "GRADUATED");
  assert.equal(graduated.authorityChanged, false);
});
