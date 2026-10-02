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
  poolAddress: process.env.SOLWEALTH_DBC_POOL || null,
});
const baby = new SolwealthBabyAI({ environment });

baby.birth();
const observation = await baby.observeAsync();
const thought = baby.think(observation.id);
if (!thought.proposal) {
  throw new Error(`Crawler halted: ${thought.decision.reason}`);
}
const experience = await baby.experienceAsync(thought.proposal.id, {
  approved: true,
  id: "crawler-devnet-simulation-gate",
});
const reflection = baby.reflect(experience);
const learning = baby.learn();
const development = baby.development();

const receipt = {
  baby: "solwealth",
  phase: "crawler",
  sourceMode: observation.state.sourceMode,
  clusterVerified: observation.state.clusterVerified,
  programId: observation.state.programId,
  programPresent: observation.state.programAccount.present,
  programExecutable: observation.state.programAccount.executable,
  observedProviderCount: observation.state.observedProviderCount,
  liveWitness: observation.observationWitness?.status ?? "NO_WITNESS",
  mindDecision: thought.decision.action,
  mindCanSelfAuthorize: thought.decision.canSelfAuthorize,
  experienceStatus: experience.status,
  simulationWitness: experience.witness?.status ?? "NO_WITNESS",
  simulationRpcContact: experience.simulation?.simulationRpcContact ?? false,
  simulationErrors: experience.simulation?.simulations?.map((entry) => entry.errClass) ?? [],
  reflection: reflection.lesson,
  learningNextFocus: learning.nextFocus,
  developmentStage: development.stage,
  recommendedStage: development.recommendedStage,
  verifiedExperiences: development.verifiedExperiences,
  unverifiedExperiences: development.unverifiedExperiences,
  memoryVerified: baby.verifyMemory(),
  realMoney: experience.simulation?.realMoney ?? false,
  transactionSigned: experience.simulation?.transactionSigned ?? false,
  transactionSubmitted: experience.simulation?.transactionSubmitted ?? false,
};

console.log(JSON.stringify(receipt, null, 2));
