import assert from "node:assert/strict";
import test from "node:test";

import { runAiProposal, validateProposal } from "../src/runtime/ai-dry-run.mjs";

const devnetSim = {
  capability: "simulate_trade",
  environment: "solana-devnet-dry-run",
  params: { pool: "example-pool", amount: 1 },
};
const human = { approved: true, id: "human-approval-1" };

test("AI proposal without human approval is denied, never simulated", () => {
  const r = runAiProposal({ proposal: devnetSim, approval: null });
  assert.equal(r.status, "DENIED");
  assert.deepEqual(r.reasons, ["human_approval_required"]);
  assert.equal(r.liveExecutionAuthorized, false);
});

test("proposal cannot self-approve through an approval field", () => {
  const r = runAiProposal({ proposal: { ...devnetSim, approval: { approved: true } }, approval: null });
  assert.equal(r.status, "REJECTED");
  assert.ok(r.reasons.includes("unexpected_field:approval"));
});

test("mainnet is denied even with a human approval", () => {
  const r = runAiProposal({ proposal: { ...devnetSim, environment: "solana-mainnet" }, approval: human });
  assert.equal(r.status, "DENIED");
  assert.equal(r.reasons[0], "environment_outside_birth_ceiling");
  assert.equal(r.authorizesRealMoney, false);
});

test("approved devnet dry-run simulates with no signing or real-money authority", () => {
  const r = runAiProposal({ proposal: devnetSim, approval: human });
  assert.equal(r.status, "SIMULATED");
  assert.equal(r.effectClass, "simulation_only");
  assert.equal(r.approvalId, "human-approval-1");
  assert.equal(r.authorizesSigning, false);
  assert.equal(r.authorizesRealMoney, false);
  assert.equal(r.authorizesExternalEffect, false);
  assert.equal(r.liveExecutionAuthorized, false);
});

test("secret, signing, broadcast and money params are rejected before the gate runs", () => {
  for (const key of ["privateKey", "secretKey", "signTx", "broadcastNow", "walletAddress", "liveMode", "transferTo"]) {
    const problems = validateProposal({ ...devnetSim, params: { [key]: "x" } });
    assert.ok(problems.some((p) => p.startsWith("forbidden_param:")), `expected ${key} to be rejected`);
  }
});

test("nested forbidden params are caught", () => {
  const problems = validateProposal({ ...devnetSim, params: { route: { signer: "x" } } });
  assert.ok(problems.includes("forbidden_param:route.signer"));
});

test("unknown capability and non-object proposals are rejected", () => {
  assert.equal(runAiProposal({ proposal: { ...devnetSim, capability: "execute_mainnet_trade" }, approval: human }).status, "REJECTED");
  assert.deepEqual(validateProposal("not-an-object"), ["proposal_must_be_object"]);
  assert.deepEqual(validateProposal(null), ["proposal_must_be_object"]);
});

test("fingerprint is stable for identical proposals and changes when content changes", () => {
  const a = runAiProposal({ proposal: devnetSim, approval: human }).fingerprint;
  const b = runAiProposal({ proposal: JSON.parse(JSON.stringify(devnetSim)), approval: human }).fingerprint;
  const c = runAiProposal({ proposal: { ...devnetSim, params: { pool: "other", amount: 1 } }, approval: human }).fingerprint;
  assert.equal(a, b);
  assert.notEqual(a, c);
});
