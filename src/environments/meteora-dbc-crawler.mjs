import { DBC_CONFIG_ACCOUNT_TYPES, DBC_POOL_ACCOUNT_TYPES } from "../cognition/dbc-account-types.mjs";
import { METEORA_DBC_PROGRAM_ID } from "./meteora-dbc-sim.mjs";

function consensusValue(states, field) {
  if (states.length === 0) return null;
  const values = states.map((state) => state[field]);
  const first = JSON.stringify(values[0]);
  return values.every((value) => JSON.stringify(value) === first) ? values[0] : null;
}

function trackedAccount(address, observation) {
  if (!address) {
    return {
      address: null,
      observed: false,
      observedProviderCount: 0,
      present: null,
      ownedByDbcProgram: null,
      accountType: null,
      accountTypeMatches: null,
      discriminatorHex: null,
      executable: null,
      owner: null,
      space: null,
      lamports: null,
      dataLength: null,
      dataHash: null,
      providerObservations: [],
    };
  }

  const providerObservations = observation?.providerObservations ?? [];
  const states = providerObservations.map((entry) => entry.state);
  const observedProviderCount = states.length;
  const present = states.length > 0 && states.every((state) => state.present === true);

  return {
    address,
    observed: observedProviderCount > 0,
    observedProviderCount,
    present,
    ownedByDbcProgram: present ? states.every((state) => state.ownerMatches === true) : null,
    accountType: consensusValue(states, "accountType"),
    accountTypeMatches: present ? states.every((state) => state.accountTypeMatches === true) : null,
    discriminatorHex: consensusValue(states, "discriminatorHex"),
    executable: consensusValue(states, "executable"),
    owner: consensusValue(states, "owner"),
    space: consensusValue(states, "space"),
    lamports: consensusValue(states, "lamports"),
    dataLength: consensusValue(states, "dataLength"),
    dataHash: consensusValue(states, "dataHash"),
    providerObservations,
  };
}

export class MeteoraDbcCrawler {
  constructor({ rpc, configAddress = null, poolAddress = null } = {}) {
    if (!rpc) throw new Error("MeteoraDbcCrawler requires a Solana Devnet RPC observer.");
    this.rpc = rpc;
    this.configAddress = configAddress;
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
    const config = this.configAddress
      ? await this.rpc.observeAccount(this.configAddress, {
          expectedOwner: this.programId,
          expectedDiscriminators: DBC_CONFIG_ACCOUNT_TYPES,
        })
      : null;
    const pool = this.poolAddress
      ? await this.rpc.observeAccount(this.poolAddress, {
          expectedOwner: this.programId,
          expectedDiscriminators: DBC_POOL_ACCOUNT_TYPES,
        })
      : null;

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
      configState: trackedAccount(this.configAddress, config),
      poolState: trackedAccount(this.poolAddress, pool),
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
