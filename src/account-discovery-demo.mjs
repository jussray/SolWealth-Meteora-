import { DBC_CONFIG_ACCOUNT_TYPES, DBC_POOL_ACCOUNT_TYPES } from "./cognition/dbc-account-types.mjs";
import { SolwealthBabyAI } from "./brain.mjs";
import { MeteoraDbcCrawler } from "./environments/meteora-dbc-crawler.mjs";
import { METEORA_DBC_PROGRAM_ID } from "./environments/meteora-dbc-sim.mjs";
import { SOLANA_DEVNET_RPC_URL, SolanaDevnetRpc } from "./rpc/solana-devnet.mjs";

const endpoints = (process.env.SOLANA_DEVNET_RPC_URLS ?? SOLANA_DEVNET_RPC_URL)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const rpc = new SolanaDevnetRpc({ endpoints });
const configDiscovery = await rpc.discoverAccountByDiscriminator(
  METEORA_DBC_PROGRAM_ID,
  DBC_CONFIG_ACCOUNT_TYPES,
);
const poolDiscovery = await rpc.discoverAccountByDiscriminator(
  METEORA_DBC_PROGRAM_ID,
  DBC_POOL_ACCOUNT_TYPES,
);

const discoveryReceipt = {
  baby: "solwealth",
  phase: "dbc-account-discovery",
  programId: METEORA_DBC_PROGRAM_ID,
  configDiscoveryStatus: configDiscovery.status,
  configDiscoveryType: configDiscovery.accountType,
  configAddress: configDiscovery.address,
  configCandidateSelectionIsEvidence: configDiscovery.candidateSelectionIsEvidence,
  poolDiscoveryStatus: poolDiscovery.status,
  poolDiscoveryType: poolDiscovery.accountType,
  poolAddress: poolDiscovery.address,
  poolCandidateSelectionIsEvidence: poolDiscovery.candidateSelectionIsEvidence,
  authorityChanged: false,
  realMoney: false,
  transactionSigned: false,
  transactionSubmitted: false,
};

if (configDiscovery.status !== "DISCOVERED" || poolDiscovery.status !== "DISCOVERED") {
  console.log(JSON.stringify({
    ...discoveryReceipt,
    status: "HALTED",
    haltReason: "required_dbc_account_candidate_not_found",
  }, null, 2));
  process.exitCode = 1;
} else {
  const environment = new MeteoraDbcCrawler({
    rpc,
    configAddress: configDiscovery.address,
    poolAddress: poolDiscovery.address,
  });
  const baby = new SolwealthBabyAI({ environment });
  baby.birth();
  const observation = await baby.observeAsync();
  const orientation = baby.orient(observation.id);

  const configState = observation.state.configState;
  const poolState = observation.state.poolState;
  const receipt = {
    ...discoveryReceipt,
    status: orientation.disposition === "LEARN" ? "OBSERVED" : "HALTED",
    clusterVerified: observation.state.clusterVerified,
    programPresent: observation.state.programAccount.present,
    programExecutable: observation.state.programAccount.executable,
    liveWitness: observation.observationWitness?.status ?? "NO_WITNESS",
    configPresent: configState.present,
    configOwnedByDbcProgram: configState.ownedByDbcProgram,
    configAccountType: configState.accountType,
    configAccountTypeMatches: configState.accountTypeMatches,
    configDiscriminatorHex: configState.discriminatorHex,
    configWitness: observation.trackedWitnesses.configState?.status ?? "NO_WITNESS",
    poolPresent: poolState.present,
    poolOwnedByDbcProgram: poolState.ownedByDbcProgram,
    poolAccountType: poolState.accountType,
    poolAccountTypeMatches: poolState.accountTypeMatches,
    poolDiscriminatorHex: poolState.discriminatorHex,
    poolWitness: observation.trackedWitnesses.poolState?.status ?? "NO_WITNESS",
    orientationDisposition: orientation.disposition,
    orientationRiskFlags: orientation.riskFlags,
    orientationWarningFlags: orientation.warningFlags,
    memoryVerified: baby.verifyMemory(),
  };

  console.log(JSON.stringify(receipt, null, 2));
  if (orientation.disposition !== "LEARN") process.exitCode = 1;
}
