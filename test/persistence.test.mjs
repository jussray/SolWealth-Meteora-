import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MeteoraDbcLab,
  PersistentMemoryLedger,
  SolwealthBabyAI,
} from "../src/index.mjs";

function withTempStore(run) {
  const directory = mkdtempSync(join(tmpdir(), "solwealth-memory-test-"));
  const path = join(directory, "memory.json");
  try {
    run(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("persistent memory survives reopen with the same verified head", () => {
  withTempStore((path) => {
    const ledger = PersistentMemoryLedger.open({ path });
    ledger.append("BIRTH", { baby: "solwealth" });
    ledger.append("OBSERVE", { lesson: "two eyes beat one" });
    const head = ledger.head().hash;

    const reopened = PersistentMemoryLedger.open({ path });
    assert.equal(reopened.size(), 2);
    assert.equal(reopened.head().hash, head);
    assert.equal(reopened.verify(), true);
  });
});

test("persistent memory rejects rewritten payload bytes", () => {
  withTempStore((path) => {
    const ledger = PersistentMemoryLedger.open({ path });
    ledger.append("BIRTH", { baby: "solwealth" });
    const document = JSON.parse(readFileSync(path, "utf8"));
    document.entries[0].payload.baby = "imposter";
    writeFileSync(path, JSON.stringify(document));
    assert.throws(() => PersistentMemoryLedger.open({ path }), /memory_integrity_failure/);
  });
});

test("persistent memory rejects a valid hash-chain prefix when anchor proves newer history existed", () => {
  withTempStore((path) => {
    const ledger = PersistentMemoryLedger.open({ path });
    ledger.append("BIRTH", { baby: "solwealth" });
    ledger.append("OBSERVE", { lesson: "keep the second memory" });
    const document = JSON.parse(readFileSync(path, "utf8"));
    document.entries.pop();
    writeFileSync(path, JSON.stringify(document));
    assert.throws(() => PersistentMemoryLedger.open({ path }), /memory_anchor_mismatch/);
  });
});

test("persistent memory fails closed when only one half of the ledger-anchor pair survives", () => {
  withTempStore((path) => {
    const ledger = PersistentMemoryLedger.open({ path });
    ledger.append("BIRTH", { baby: "solwealth" });
    unlinkSync(`${path}.anchor`);
    assert.throws(() => PersistentMemoryLedger.open({ path }), /memory_store_pair_incomplete/);
  });
});

test("restart reconstructs development from verified experiences but restores no old approval", () => {
  withTempStore((path) => {
    const firstMemory = PersistentMemoryLedger.open({ path });
    const first = new SolwealthBabyAI({ environment: new MeteoraDbcLab(), memory: firstMemory });
    first.birth();
    const observation = first.observe({ configExists: true, poolExists: false });
    const thought = first.think(observation.id);
    const experience = first.experience(thought.proposal.id, { approved: true, id: "first-process-human" });
    first.reflect(experience);
    assert.equal(first.development().verifiedExperiences, 1);
    assert.equal(first.development().recommendedStage, "crawler");

    const secondMemory = PersistentMemoryLedger.open({ path });
    const second = new SolwealthBabyAI({ environment: new MeteoraDbcLab(), memory: secondMemory });
    assert.equal(second.development().verifiedExperiences, 1);
    assert.equal(second.development().recommendedStage, "crawler");
    const resume = second.resume();
    assert.equal(resume.authorityRestored, false);
    assert.equal(resume.pendingApprovalsRestored, false);
    assert.equal(resume.pendingProposalsRestored, false);
    assert.equal(second.verifyMemory(), true);
    assert.throws(() => second.birth(), /birth_already_recorded_use_resume/);
  });
});
