import { createHash } from "node:crypto";

const PROGRAM_ID = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";

function id(prefix, value) {
  return `${prefix}_${createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16)}`;
}

export class MeteoraDbcLab {
  constructor() {
    this.name = "meteora-dbc-lab";
    this.environment = "solana-devnet-dry-run";
    this.dryRun = true;
    this.programId = PROGRAM_ID;
    this.supportedActions = Object.freeze([
      "create_config_plan",
      "create_pool_plan",
      "quote_swap_plan",
      "inspect_migration_plan",
    ]);
  }

  observe(seed = {}) {
    return {
      environment: this.environment,
      dryRun: this.dryRun,
      programId: this.programId,
      poolConfig: {
        exists: Boolean(seed.configExists),
        quoteMint: seed.quoteMint ?? "SOL",
        migrationOption: "DAMM_V2",
        migrationQuoteThreshold: seed.migrationQuoteThreshold ?? 10,
      },
      poolState: {
        exists: Boolean(seed.poolExists),
        quoteReserve: Number(seed.quoteReserve ?? 0),
      },
    };
  }

  capabilityFor(action) {
    const map = {
      create_config_plan: "plan_devnet",
      create_pool_plan: "simulate_launch",
      quote_swap_plan: "simulate_trade",
      inspect_migration_plan: "observe",
    };
    return map[action] ?? null;
  }

  simulate(action, params = {}) {
    if (!this.supportedActions.includes(action)) {
      throw new Error(`Unsupported DBC lab action: ${action}`);
    }

    const publicState = {
      action,
      network: "solana-devnet",
      dryRun: true,
      programId: this.programId,
      params: structuredClone(params),
      transactionSigned: false,
      transactionSubmitted: false,
      realMoney: false,
    };

    const receiptId = id("dbc_dryrun", publicState);
    const stateForWitness = {
      receiptId,
      action,
      dryRun: true,
      programId: this.programId,
      transactionSubmitted: false,
    };

    return {
      status: "SIMULATED",
      receiptId,
      publicState,
      providerObservations: [
        { provider: "devnet-rpc-sim-a", state: stateForWitness },
        { provider: "devnet-rpc-sim-b", state: structuredClone(stateForWitness) },
        { provider: "devnet-rpc-sim-c", state: structuredClone(stateForWitness) },
      ],
      providerObservationsAreSimulated: true,
    };
  }
}

export const METEORA_DBC_PROGRAM_ID = PROGRAM_ID;
