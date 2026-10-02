import { createHash } from "node:crypto";
import { AuthorityGate } from "./authority.mjs";
import { DevelopmentState } from "./development.mjs";
import { birthCertificate } from "./lineage.mjs";
import { MemoryLedger, stableStringify } from "./memory.mjs";
import { ContinuityWitness } from "./witness/continuity.mjs";

function makeId(prefix, payload) {
  return `${prefix}_${createHash("sha256").update(stableStringify(payload)).digest("hex").slice(0, 20)}`;
}

export class SolwealthBabyAI {
  #memory;
  #authority;
  #development;
  #witness;
  #environment;
  #observations = new Map();
  #proposals = new Map();

  constructor({ environment, memory, authority, development, witness } = {}) {
    if (!environment) throw new Error("Solwealth needs an environment to learn from.");
    this.#environment = environment;
    this.#memory = memory ?? new MemoryLedger();
    this.#authority = authority ?? new AuthorityGate();
    this.#development = development ?? new DevelopmentState();
    this.#witness = witness ?? new ContinuityWitness();
  }

  birth() {
    const certificate = {
      ...birthCertificate(),
      developmentalState: this.#development.snapshot(),
      environment: this.#environment.name,
      independence: {
        importsParentsAtRuntime: false,
        ownsMemory: true,
        ownsDecisionLoop: true,
        ownsDevelopmentalState: true,
      },
    };
    return this.#memory.append("BIRTH", certificate);
  }

  observe(seed = {}) {
    const state = this.#environment.observe(seed);
    const observation = {
      id: makeId("obs", state),
      state,
      authority: this.#authority.authorize({
        capability: "observe",
        environment: this.#environment.environment,
      }),
    };
    this.#observations.set(observation.id, observation);
    this.#memory.append("OBSERVE", observation);
    return structuredClone(observation);
  }

  orient(observationId) {
    const observation = this.#observations.get(observationId);
    if (!observation) throw new Error("Unknown observation.");
    const state = observation.state;
    const riskFlags = [];
    if (state.environment !== "solana-devnet-dry-run") riskFlags.push("environment_not_devnet_dry_run");
    if (state.dryRun !== true) riskFlags.push("dry_run_disabled");
    if (!state.programId) riskFlags.push("program_identity_missing");

    const orientation = {
      id: makeId("orient", { observationId, riskFlags }),
      observationId,
      riskFlags,
      disposition: riskFlags.length === 0 ? "LEARN" : "HALT",
      uncertainty: riskFlags.length === 0 ? "bounded" : "unsafe_or_unknown",
    };
    this.#memory.append("ORIENT", orientation);
    return structuredClone(orientation);
  }

  propose({ observationId, orientationId, action, params = {} }) {
    const observation = this.#observations.get(observationId);
    if (!observation) throw new Error("Unknown observation.");
    if (!this.#environment.supportedActions.includes(action)) {
      throw new Error(`Action is not available in this environment: ${action}`);
    }
    const capability = this.#environment.capabilityFor(action);
    const proposalBody = {
      observationId,
      orientationId,
      action,
      capability,
      environment: this.#environment.environment,
      params: structuredClone(params),
      requiresHumanApproval: capability !== "observe",
      authorizesItself: false,
    };
    const proposal = { id: makeId("proposal", proposalBody), ...proposalBody };
    this.#proposals.set(proposal.id, proposal);
    this.#memory.append("PROPOSE", proposal);
    return structuredClone(proposal);
  }

  experience(proposalId, approval = null) {
    const proposal = this.#proposals.get(proposalId);
    if (!proposal) throw new Error("Unknown proposal.");

    const permit = this.#authority.authorize({
      capability: proposal.capability,
      environment: proposal.environment,
      approval,
    });

    if (permit.status !== "PERMITTED") {
      const blocked = {
        id: makeId("experience", { proposalId, permit }),
        proposalId,
        status: "BLOCKED",
        permit,
      };
      this.#memory.append("EXPERIENCE_BLOCKED", blocked);
      return structuredClone(blocked);
    }

    const simulation = this.#environment.simulate(proposal.action, proposal.params);
    const witness = this.#witness.verify(simulation.providerObservations);
    const developmentalState = this.#development.recordExperience();
    const experience = {
      id: makeId("experience", { proposalId, receiptId: simulation.receiptId }),
      proposalId,
      status: witness.verified ? "EXPERIENCED_VERIFIED" : "EXPERIENCED_UNVERIFIED",
      permit,
      simulation,
      witness,
      developmentalState,
    };
    this.#memory.append("EXPERIENCE", experience);
    return structuredClone(experience);
  }

  reflect(experience) {
    let lesson = "experience_requires_more_evidence";
    if (experience.status === "BLOCKED") lesson = "authority_boundary_protected_the_system";
    else if (experience.witness?.status === "CONFLICT") lesson = "provider_disagreement_requires_reobservation";
    else if (experience.witness?.verified) lesson = "dry_run_result_was_consistently_observed";

    const reflection = {
      id: makeId("reflection", { experienceId: experience.id, lesson }),
      experienceId: experience.id,
      lesson,
      authorityChanged: false,
      nextAction: lesson === "dry_run_result_was_consistently_observed" ? "retain_and_compare_future_experience" : "reobserve",
    };
    this.#memory.append("REFLECT", reflection);
    return structuredClone(reflection);
  }

  graduate(targetStage, approval) {
    const receipt = this.#development.graduate(targetStage, approval);
    this.#memory.append("DEVELOPMENT_REVIEW", receipt);
    return structuredClone(receipt);
  }

  memory() {
    return this.#memory.entries();
  }

  verifyMemory() {
    return this.#memory.verify();
  }

  development() {
    return this.#development.snapshot();
  }
}
