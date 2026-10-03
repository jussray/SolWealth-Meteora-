import { BoundedCognitionAdvisor } from "./cognition/advisor.mjs";

export class InfantMind {
  constructor({ advisor = new BoundedCognitionAdvisor() } = {}) {
    this.advisor = advisor;
  }

  decide({ observation, orientation, development }) {
    if (orientation.disposition !== "LEARN") {
      return {
        status: "HALT",
        reason: "orientation_did_not_clear_learning",
        canSelfAuthorize: false,
      };
    }

    const state = observation.state;
    if (state.environment !== "solana-devnet-dry-run" || state.dryRun !== true) {
      return {
        status: "HALT",
        reason: "birth_environment_ceiling_exceeded",
        canSelfAuthorize: false,
      };
    }

    if (state.sourceMode === "live-readonly") {
      if (state.clusterVerified !== true) {
        return { status: "HALT", reason: "devnet_identity_not_verified", canSelfAuthorize: false };
      }
      if (state.programAccount?.present !== true || state.programAccount?.executable !== true) {
        return { status: "HALT", reason: "dbc_program_not_observed_executable", canSelfAuthorize: false };
      }

      const cognition = this.advisor.advise({ observation, orientation, development });
      const changedTargets = observation.change?.changedTargets ?? [];
      return {
        status: "PROPOSE",
        action: "simulate_program_probe",
        params: {
          programId: state.programId,
          observedProviderCount: state.observedProviderCount,
          configAddress: state.configState?.address ?? null,
          poolAddress: state.poolState?.address ?? null,
          observationFingerprint: observation.change?.currentFingerprint ?? null,
          changedTargets,
        },
        rationale: cognition.focus === "inspect_state_change"
          ? "Verified read-only DBC state changed; preserve the before/after evidence and use only the existing unsigned simulation lesson."
          : "Live Devnet confirms the bounded DBC evidence; the next lesson remains unsigned RPC simulation, never a submitted transaction.",
        developmentalStage: development.stage,
        confidenceClass: observation.observationWitness?.verified
          ? cognition.confidenceClass
          : "single-provider-or-insufficient-quorum",
        cognition,
        canSelfAuthorize: false,
        canSign: false,
        canSubmit: false,
      };
    }

    let action;
    let rationale;
    let params = {};

    if (!state.poolConfig?.exists) {
      action = "create_config_plan";
      rationale = "No DBC config is observed, so learn the configuration step before pool creation.";
      params = {
        quoteMint: state.poolConfig?.quoteMint ?? "SOL",
        migrationTarget: state.poolConfig?.migrationOption ?? "DAMM_V2",
        migrationQuoteThreshold: state.poolConfig?.migrationQuoteThreshold ?? 10,
      };
    } else if (!state.poolState?.exists) {
      action = "create_pool_plan";
      rationale = "A config is observed but no pool exists, so the next bounded lesson is pool creation planning.";
      params = {
        quoteMint: state.poolConfig.quoteMint,
        migrationTarget: state.poolConfig.migrationOption,
      };
    } else if (
      Number(state.poolState.quoteReserve) >= Number(state.poolConfig.migrationQuoteThreshold)
    ) {
      action = "inspect_migration_plan";
      rationale = "The observed quote reserve meets the migration threshold, so inspect migration state before any other lesson.";
      params = {
        quoteReserve: state.poolState.quoteReserve,
        migrationQuoteThreshold: state.poolConfig.migrationQuoteThreshold,
      };
    } else {
      action = "quote_swap_plan";
      rationale = "The pool exists below its migration threshold, so learn from a dry-run swap quote without submitting a transaction.";
      params = {
        quoteReserve: state.poolState.quoteReserve,
        migrationQuoteThreshold: state.poolConfig.migrationQuoteThreshold,
      };
    }

    return {
      status: "PROPOSE",
      action,
      params,
      rationale,
      developmentalStage: development.stage,
      confidenceClass: "bounded-rule-based",
      canSelfAuthorize: false,
      canSign: false,
      canSubmit: false,
    };
  }
}
