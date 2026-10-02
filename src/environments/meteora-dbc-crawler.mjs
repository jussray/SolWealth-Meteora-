import { METEORA_DBC_PROGRAM_ID } from "./meteora-dbc-sim.mjs";

export class MeteoraDbcCrawler {
  constructor({ rpc, poolAddress = null } = {}) {
    if (!rpc) throw new Error("MeteoraDbcCrawler requires a Solana Devnet RPC observer.");
    this.rpc = rpc;
    this.poolAddress = poolAddress;
    this.name = "meteora-dbc-crawler";
    this.environment = "solana-devnet-dry-run";
    this.dryRun = true;
    this.sourceMode = "live-readonly";
    this.programId = METEORA_DBC_PROGRAM_ID;
    this.supportedActions = Object.freeze(["simulate_program_probe"]);
  }

  async observeAsync() {
    const program = await this.rpc.observeProgram(this.programId);
    let pool = null;
    if (this.poolAddress) {
      pool = await this.rpc.observeAccount(this.poolAddress, { expectedOwner: this.programId });
    }
    const poolProviders = pool?.providers?.filter((entry) => entry.status === "OBSERVED") ?? [];
    return {
      environment: this.environment,
      dryRun: this.dryRun,
      sourceMode: this.sourceMode,
      programId: this.programId,
      clusterVerified: program.clusterVerified,
      configuredProviderCount: program.configuredProviderCount,
      observedProviderCount: program.observedProviderCount,
      providerFailureCount: program.providerFailureCount,
      programAccount: program.programAccount,
      providers: program.providers,
      providerObservations: program.providerObservations,
      poolState: this.poolAddress ? {
        address: this.poolAddress,
        observed: poolProviders.length > 0,
        present: poolProviders.length > 0 && poolProviders.every((entry) => entry.present === true),
        ownedByDbcProgram: poolProviders.length > 0 && poolProviders.every((entry) => entry.ownerMatches === true),
        providerObservations: pool.providerObservations,
      } : {
        address: null,
        observed: false,
        present: null,
        ownedByDbcProgram: null,
        providerObservations: [],
      },
    };
  }

  capabilityFor(action) {
    return action === "simulate_program_probe" ? "simulate_devnet_transaction" : null;
  }

  async simulateAsync(action) {
    if (!this.supportedActions.includes(action)) {
      throw new Error(`Unsupported crawler action: ${action}`);
    }
    return this.rpc.simulateProgramProbe(this.programId);
  }
}
