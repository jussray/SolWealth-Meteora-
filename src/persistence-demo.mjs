import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = mkdtempSync(join(tmpdir(), "solwealth-memory-"));
const path = join(directory, "memory.json");
const worker = fileURLToPath(new URL("./persistence-worker.mjs", import.meta.url));

function run(mode) {
  return JSON.parse(execFileSync(process.execPath, [worker, mode, path], { encoding: "utf8" }));
}

try {
  const seed = run("seed");
  const resumed = run("resume");
  const receipt = {
    baby: "solwealth",
    proof: "cross-process-memory-restart",
    seedHeadHash: seed.headHash,
    resumedFromHeadHash: resumed.resume.previousHeadHash,
    memorySurvivedRestart: resumed.resume.previousHeadHash === seed.headHash,
    verifiedExperiencesRestored: resumed.development.verifiedExperiences,
    recommendedStage: resumed.development.recommendedStage,
    authorityRestored: resumed.resume.authorityRestored,
    pendingProposalsRestored: resumed.resume.pendingProposalsRestored,
    pendingApprovalsRestored: resumed.resume.pendingApprovalsRestored,
    memoryVerified: resumed.memoryVerified,
    realMoney: false,
    transactionSigned: false,
    transactionSubmitted: false,
  };
  if (!receipt.memorySurvivedRestart || !receipt.memoryVerified) {
    throw new Error("restart continuity proof failed");
  }
  if (receipt.authorityRestored || receipt.pendingProposalsRestored || receipt.pendingApprovalsRestored) {
    throw new Error("restart restored authority-shaped state");
  }
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
