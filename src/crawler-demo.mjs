import { MeteoraDbcCrawler } from "./environments/meteora-dbc-crawler.mjs";
import { SolwealthBabyAI } from "./brain.mjs";
import { SOLANA_DEVNET_RPC_URL, SolanaDevnetRpc } from "./rpc/solana-devnet.mjs";

const endpoints = (process.env.SOLANA_DEVNET_RPC_URLS ?? SOLANA_DEVNET_RPC_URL)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const rpc = new SolanaDevnetRpc({ endpoints });
const environment = new MeteoraDbcCrawler({
  rpc,
  configAddress: process.env.SOLWEALTH_DBC_CONFIG || null,
  poolAddress: process.env.SOLWEALTH_DBC_POOL || null,
});
const baby = new SolwealthBabyAI({ environment });

baby.birth();
const observation = await baby.observeAsync();
const thought = baby.think(observation.id);

const cognition = thought.decision?.cognition ?? null;
const baseReceipt = {
  baby: "solwealth",
  phase: "crawler",
  sourceMode: observation.state.sourceMode,
  clusterVerified: observation.state.clusterVerified,
  programId: observation.state.programId,
  programPresent: observation.state.programAccount.present,
  programExecutable: observation.state.programAccount.executable,
  observedProviderCount: observation.state.observedProviderCount,
  providerFailureCount: observation.state.providerFailureCount,
  providerStatuses: observation.state.providers,
  liveWitness: observation.observationWitness?.status ?? "NO_WITNESS",
  observationFingerprint: observation.change?.currentFingerprint ?? null,
  noveltyClass: observation.change?.noveltyClass ?? null,
  changedTargets: observation.change?.changedTargets ?? [],
  trackedConfigAddress: observation.state.configState?.address ?? null,
  trackedPoolAddress: observation.state.poolState?.address ?? null,
  cognitionSource: cognition?.source ?? null,
  cognitionFocus: cognition?.focus ?? null,
  cognitionCanSelfAuthorize: cognition?.canSelfAuthorize ?? false,
  orientationRiskFlags: thought.orientation.riskFlags,
  orientationWarningFlags: thought.orientation.warningFlags,
  mindCanSelfAuthorize: thought.decision.canSelfAuthorize,
  memoryVerified: baby.verifyMemory(),
  realMoney: false,
  transactionSigned: false,
  transactionSubmitted: false,
};

if (!thought.proposal) {
  console.log(JSON.stringify({
    ...baseReceipt,
    status: "HALTED",
    haltReason: thought.decision.reason,
  }, null, 2));
} else {
  const experience = await baby.experienceAsync(thought.proposal.id, {
    approved: true,
    id: "crawler-devnet-simulation-gate",
  });
  const reflection = baby.reflect(experience);
  const learning = baby.learn();
  const development = baby.development();

  const receipt = {
    ...baseReceipt,
    status: "OBSERVED",
    mindDecision: thought.decision.action,
    experienceStatus: experience.status,
    experienceFingerprint: experience.fingerprint,
    simulationWitness: experience.witness?.status ?? "NO_WITNESS",
    simulationRpcContact: experience.simulation?.simulationRpcContact ?? false,
    simulationErrors: experience.simulation?.simulations?.map((entry) => entry.errClass) ?? [],
    reflection: reflection.lesson,
    learningNextFocus: learning.nextFocus,
    developmentStage: development.stage,
    recommendedStage: development.recommendedStage,
    verifiedExperiences: development.verifiedExperiences,
    unverifiedExperiences: development.unverifiedExperiences,
    realMoney: experience.simulation?.realMoney ?? false,
    transactionSigned: experience.simulation?.transactionSigned ?? false,
    transactionSubmitted: experience.simulation?.transactionSubmitted ?? false,
  };

  console.log(JSON.stringify(receipt, null, 2));
}
