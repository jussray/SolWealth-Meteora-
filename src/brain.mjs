import { createHash } from "node:crypto";
import { AuthorityGate } from "./authority.mjs";
import { compareObservedState } from "./cognition/fingerprint.mjs";
import { DevelopmentState } from "./development.mjs";
import { deriveLearning } from "./learning/patterns.mjs";
import { birthCertificate } from "./lineage.mjs";
import { MemoryLedger, stableStringify } from "./memory.mjs";
import { InfantMind } from "./mind.mjs";
import { ContinuityWitness } from "./witness/continuity.mjs";

function makeId(prefix, payload) {
  return `${prefix}_${createHash("sha256").update(stableStringify(payload)).digest("hex").slice(0, 20)}`;
}

function sameTrackedIdentity(left, right) {
  return left?.environment === right?.environment
    && left?.sourceMode === right?.sourceMode
    && left?.programId === right?.programId
    && (left?.configState?.address ?? null) === (right?.configState?.address ?? null)
    && (left?.poolState?.address ?? null) === (right?.poolState?.address ?? null);
}

export class SolwealthBabyAI {
  #memory;
  #authority;
  #development;
  #witness;
  #environment;
  #mind;
  #observations = new Map();
  #proposals = new Map();
  #consumedProposals = new Set();

  constructor({ environment, memory, authority, development, witness, mind } = {}) {
    if (!environment) throw new Error("Solwealth needs an environment to learn from.");
    this.#environment = environment;
    this.#memory = memory ?? new MemoryLedger();
    this.#authority = authority ?? new AuthorityGate();
    this.#development = development ?? DevelopmentState.fromMemory(this.#memory.entries());
    this.#witness = witness ?? new ContinuityWitness();
    this.#mind = mind ?? new InfantMind();
  }

  birth() {
    if (this.#memory.entries().some((entry) => entry.kind === "BIRTH")) {
      throw new Error("birth_already_recorded_use_resume");
    }
    const certificate = {
      ...birthCertificate(),
      developmentalState: this.#development.snapshot(),
      environment: this.#environment.name,
      mind: "infant-mind-v1",
      independence: {
        importsParentsAtRuntime: false,
        ownsMemory: true,
        ownsDecisionLoop: true,
        ownsDevelopmentalState: true,
        formsOwnProposals: true,
      },
    };
    return this.#memory.append("BIRTH", certificate);
  }

  resume() {
    const entries = this.#memory.entries();
    if (!entries.some((entry) => entry.kind === "BIRTH")) {
      throw new Error("cannot_resume_before_birth");
    }
    if (!this.#memory.verify()) {
      throw new Error("cannot_resume_unverified_memory");
    }
    const previousHeadHash = entries.at(-1)?.hash ?? "GENESIS";
    const receipt = {
      status: "RESUMED",
      previousHeadHash,
      memoryEntryCountBeforeResume: entries.length,
      developmentalState: this.#development.snapshot(),
      authorityRestored: false,
      pendingProposalsRestored: false,
      pendingApprovalsRestored: false,
      note: "Knowledge and development may resume; prior effect authority does not.",
    };
    this.#memory.append("RESUME", receipt);
    return structuredClone(receipt);
  }

  observe(seed = {}) {
    const state = this.#environment.observe(seed);
    return this.#recordObservation(state);
  }

  async observeAsync(seed = {}) {
    if (typeof this.#environment.observeAsync !== "function") {
      throw new Error("This environment does not expose live asynchronous observation.");
    }
    const state = await this.#environment.observeAsync(seed);
    return this.#recordObservation(state);
  }

  #recordObservation(state) {
    const providerObservations = state.providerObservations ?? [];
    const observationWitness = providerObservations.length > 0
      ? this.#witness.verify(providerObservations)
      : null;

    const trackedWitnesses = {};
    for (const target of ["configState", "poolState"]) {
      const nestedObservations = state[target]?.providerObservations ?? [];
      trackedWitnesses[target] = nestedObservations.length > 0
        ? this.#witness.verify(nestedObservations)
        : null;
    }

    const publicState = structuredClone(state);
    delete publicState.providerObservations;
    for (const target of ["configState", "poolState"]) {
      if (publicState[target]) delete publicState[target].providerObservations;
    }

    const priorEntry = [...this.#memory.entries()]
      .reverse()
      .find((entry) => entry.kind === "OBSERVE" && sameTrackedIdentity(entry.payload?.state, publicState));
    const change = compareObservedState(priorEntry?.payload?.state ?? null, publicState);

    const observation = {
      id: makeId("obs", { publicState, currentFingerprint: change.currentFingerprint }),
      state: publicState,
      observationWitness,
      trackedWitnesses,
      change,
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
    const warningFlags = [];
    if (state.environment !== "solana-devnet-dry-run") riskFlags.push("environment_not_devnet_dry_run");
    if (state.dryRun !== true) riskFlags.push("dry_run_disabled");
    if (!state.programId) riskFlags.push("program_identity_missing");

    if (state.sourceMode === "live-readonly") {
      if (state.clusterVerified !== true) riskFlags.push("devnet_identity_not_verified");
      if (state.programAccount?.present !== true) riskFlags.push("dbc_program_not_present");
      if (state.programAccount?.executable !== true) riskFlags.push("dbc_program_not_executable");
      if (observation.observationWitness?.status === "CONFLICT") riskFlags.push("provider_conflict");
      else if (observation.observationWitness?.verified !== true) warningFlags.push("provider_quorum_not_met");

      for (const target of ["configState", "poolState"]) {
        const tracked = state[target];
        const witness = observation.trackedWitnesses?.[target];
        if (!tracked?.address) continue;
        if (witness?.status === "CONFLICT") riskFlags.push(`${target}_provider_conflict`);
        else if (witness?.verified !== true) warningFlags.push(`${target}_provider_quorum_not_met`);
        if (tracked.present !== true) warningFlags.push(`${target}_not_present`);
        if (tracked.present === true && tracked.ownedByDbcProgram !== true) {
          riskFlags.push(`${target}_owner_mismatch`);
        }
      }
    }

    const orientation = {
      id: makeId("orient", { observationId, riskFlags, warningFlags }),
      observationId,
      riskFlags,
      warningFlags,
      disposition: riskFlags.length === 0 ? "LEARN" : "HALT",
      uncertainty: riskFlags.length > 0
        ? "unsafe_or_unknown"
        : warningFlags.length > 0
          ? "bounded_with_incomplete_quorum"
          : "bounded",
    };
    this.#memory.append("ORIENT", orientation);
    return structuredClone(orientation);
  }

  think(observationId) {
    const observation = this.#observations.get(observationId);
    if (!observation) throw new Error("Unknown observation.");
    const orientation = this.orient(observationId);
    const decision = this.#mind.decide({
      observation,
      orientation,
      development: this.#development.snapshot(),
    });
    this.#memory.append("THINK", decision);
    if (decision.status !== "PROPOSE") {
      return { orientation, decision, proposal: null };
    }
    const proposal = this.propose({
      observationId,
      orientationId: orientation.id,
      action: decision.action,
      params: decision.params,
      rationale: decision.rationale,
      origin: "infant-mind-v1",
    });
    return { orientation, decision, proposal };
  }

  propose({ observationId, orientationId, action, params = {}, rationale = "requested", origin = "caller" }) {
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
      rationale,
      origin,
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
    const permit = this.#authority.authorize({ capability: proposal.capability, environment: proposal.environment, approval });
    if (permit.status !== "PERMITTED") return this.#recordBlocked(proposalId, permit);
    if (this.#consumedProposals.has(proposalId)) throw new Error("Proposal already experienced.");
    this.#consumedProposals.add(proposalId);
    try {
      const simulation = this.#environment.simulate(proposal.action, proposal.params);
      return this.#recordCompleted(proposalId, permit, simulation);
    } catch (error) {
      return this.#recordUnknown(proposalId, permit, error);
    }
  }

  async experienceAsync(proposalId, approval = null) {
    const proposal = this.#proposals.get(proposalId);
    if (!proposal) throw new Error("Unknown proposal.");
    const permit = this.#authority.authorize({ capability: proposal.capability, environment: proposal.environment, approval });
    if (permit.status !== "PERMITTED") return this.#recordBlocked(proposalId, permit);
    if (this.#consumedProposals.has(proposalId)) throw new Error("Proposal already experienced.");
    this.#consumedProposals.add(proposalId);
    try {
      const simulation = typeof this.#environment.simulateAsync === "function"
        ? await this.#environment.simulateAsync(proposal.action, proposal.params)
        : this.#environment.simulate(proposal.action, proposal.params);
      return this.#recordCompleted(proposalId, permit, simulation);
    } catch (error) {
      return this.#recordUnknown(proposalId, permit, error);
    }
  }

  #recordBlocked(proposalId, permit) {
    const blocked = { id: makeId("experience", { proposalId, permit }), proposalId, status: "BLOCKED", permit };
    this.#memory.append("EXPERIENCE_BLOCKED", blocked);
    return structuredClone(blocked);
  }

  #recordUnknown(proposalId, permit, error) {
    const unknown = {
      id: makeId("experience", { proposalId, error: error.message }),
      proposalId,
      status: "UNKNOWN",
      permit,
      error: error.message,
      requiresReconciliation: true,
    };
    this.#memory.append("EXPERIENCE_UNKNOWN", unknown);
    return structuredClone(unknown);
  }

  #recordCompleted(proposalId, permit, simulation) {
    const witness = this.#witness.verify(simulation.providerObservations);
    const developmentalState = this.#development.recordExperience({ verified: witness.verified });
    const fingerprint = makeId("xfp", {
      proposalId,
      simulationStatus: simulation.status,
      witnessStatus: witness.status,
      providerStates: simulation.providerObservations?.map((entry) => entry.state) ?? [],
    });
    const experience = {
      id: makeId("experience", { proposalId, simulationStatus: simulation.status, witness: witness.status }),
      fingerprint,
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
    else if (experience.status === "UNKNOWN") lesson = "unknown_outcome_requires_reconciliation";
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

  learn() {
    const learning = deriveLearning(this.#memory.entries());
    const receipt = {
      id: makeId("learning", learning),
      ...learning,
      authorityChanged: false,
    };
    this.#memory.append("LEARN", receipt);
    return structuredClone(receipt);
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
