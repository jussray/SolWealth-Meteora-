const OBSERVATION_CAPABILITIES = new Set([
  "observe",
  "orient",
  "propose",
  "reflect",
  "remember",
]);

const SIMULATED_EFFECT_CAPABILITIES = new Set([
  "simulate_launch",
  "simulate_mint",
  "simulate_wallet",
  "simulate_trade",
  "simulate_spend",
  "simulate_transfer",
  "simulate_devnet_transaction",
  "plan_devnet",
]);

const ALLOWED_ENVIRONMENTS = new Set(["local-sim", "solana-devnet-dry-run"]);

export const CAPABILITY_CATALOG = Object.freeze([
  ...OBSERVATION_CAPABILITIES,
  ...SIMULATED_EFFECT_CAPABILITIES,
]);

export class AuthorityGate {
  authorize({ capability, environment, approval = null }) {
    const known = CAPABILITY_CATALOG.includes(capability);
    const safeEnvironment = ALLOWED_ENVIRONMENTS.has(environment);
    const requiresApproval = SIMULATED_EFFECT_CAPABILITIES.has(capability);

    if (!known) {
      return this.#deny(capability, environment, "unknown_capability");
    }
    if (!safeEnvironment) {
      return this.#deny(capability, environment, "environment_outside_birth_ceiling");
    }
    if (requiresApproval && approval?.approved !== true) {
      return this.#deny(capability, environment, "human_approval_required");
    }

    return Object.freeze({
      status: "PERMITTED",
      capability,
      environment,
      requiresHumanApproval: requiresApproval,
      approvalId: requiresApproval ? approval.id ?? "human-approval" : null,
      effectClass: requiresApproval ? "simulation_only" : "observation_only",
      authorizesExternalEffect: false,
      authorizesRealMoney: false,
      authorizesSigning: false,
    });
  }

  #deny(capability, environment, reason) {
    return Object.freeze({
      status: "DENIED",
      capability,
      environment,
      reason,
      authorizesExternalEffect: false,
      authorizesRealMoney: false,
      authorizesSigning: false,
    });
  }
}
