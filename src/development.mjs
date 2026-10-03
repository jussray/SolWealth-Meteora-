const STAGES = Object.freeze(["newborn", "crawler", "explorer", "apprentice"]);
const EXPERIENCE_FLOORS = Object.freeze({ newborn: 0, crawler: 1, explorer: 5, apprentice: 12 });

export class DevelopmentState {
  #stage = "newborn";
  #experiences = 0;
  #verifiedExperiences = 0;
  #unverifiedExperiences = 0;

  static fromMemory(entries = []) {
    if (!Array.isArray(entries)) throw new Error("development_memory_must_be_array");
    const state = new DevelopmentState();
    for (const entry of entries) {
      if (entry?.kind === "EXPERIENCE") {
        state.recordExperience({ verified: entry.payload?.witness?.verified === true });
      }
      if (entry?.kind === "DEVELOPMENT_REVIEW" && entry.payload?.status === "GRADUATED") {
        const targetStage = entry.payload.stage;
        if (!STAGES.includes(targetStage) || entry.payload.authorityChanged !== false) {
          throw new Error("development_memory_invalid");
        }
        const targetIndex = STAGES.indexOf(targetStage);
        const currentIndex = STAGES.indexOf(state.#stage);
        const recommendedIndex = STAGES.indexOf(state.recommendedStage());
        if (targetIndex < currentIndex || targetIndex > recommendedIndex) {
          throw new Error("development_memory_transition_invalid");
        }
        state.#stage = targetStage;
      }
    }
    return state;
  }

  get stage() {
    return this.#stage;
  }

  get experiences() {
    return this.#experiences;
  }

  recordExperience({ verified = true } = {}) {
    this.#experiences += 1;
    if (verified) this.#verifiedExperiences += 1;
    else this.#unverifiedExperiences += 1;
    return this.snapshot();
  }

  recommendedStage() {
    return STAGES.reduce(
      (best, stage) => (this.#verifiedExperiences >= EXPERIENCE_FLOORS[stage] ? stage : best),
      "newborn",
    );
  }

  graduate(targetStage, approval) {
    if (!STAGES.includes(targetStage)) {
      return { status: "DENIED", reason: "unknown_stage", stage: this.#stage };
    }
    if (approval?.approved !== true) {
      return { status: "DENIED", reason: "human_approval_required", stage: this.#stage };
    }
    const recommendedIndex = STAGES.indexOf(this.recommendedStage());
    const targetIndex = STAGES.indexOf(targetStage);
    const currentIndex = STAGES.indexOf(this.#stage);
    if (targetIndex > recommendedIndex) {
      return { status: "DENIED", reason: "verified_experience_floor_not_met", stage: this.#stage };
    }
    if (targetIndex < currentIndex) {
      return { status: "DENIED", reason: "development_cannot_rewind_silently", stage: this.#stage };
    }
    this.#stage = targetStage;
    return {
      status: "GRADUATED",
      stage: this.#stage,
      authorityChanged: false,
      note: "Developmental scope changed; financial authority did not.",
    };
  }

  snapshot() {
    return {
      stage: this.#stage,
      experiences: this.#experiences,
      verifiedExperiences: this.#verifiedExperiences,
      unverifiedExperiences: this.#unverifiedExperiences,
      recommendedStage: this.recommendedStage(),
      authorityAutoExpansion: false,
    };
  }
}
