export function deriveLearning(entries) {
  const experiences = entries.filter((entry) => entry.kind === "EXPERIENCE").map((entry) => entry.payload);
  const observations = entries.filter((entry) => entry.kind === "OBSERVE").map((entry) => entry.payload);
  const unknown = entries.filter((entry) => entry.kind === "EXPERIENCE_UNKNOWN").length;
  const blocked = entries.filter((entry) => entry.kind === "EXPERIENCE_BLOCKED").length;
  const reflections = entries.filter((entry) => entry.kind === "REFLECT").map((entry) => entry.payload);
  const verified = experiences.filter((experience) => experience.status === "EXPERIENCED_VERIFIED").length;
  const unverified = experiences.filter((experience) => experience.status !== "EXPERIENCED_VERIFIED").length;
  const conflicts = experiences.filter((experience) => experience.witness?.status === "CONFLICT").length;
  const changedObservations = observations.filter((observation) => observation.change?.noveltyClass === "CHANGED").length;
  const unchangedObservations = observations.filter((observation) => observation.change?.noveltyClass === "UNCHANGED").length;
  const baselines = observations.filter((observation) => observation.change?.noveltyClass === "BASELINE").length;
  const lessons = Object.fromEntries(
    [...new Set(reflections.map((reflection) => reflection.lesson))].map((lesson) => [
      lesson,
      reflections.filter((reflection) => reflection.lesson === lesson).length,
    ]),
  );

  let nextFocus = "gather_first_experience";
  if (conflicts > 0) nextFocus = "resolve_provider_conflict";
  else if (unknown > 0 || unverified > 0) nextFocus = "gather_more_independent_evidence";
  else if (changedObservations > 0 && verified > 0) nextFocus = "compare_verified_state_change";
  else if (verified >= 2) nextFocus = "compare_repeatable_verified_patterns";
  else if (verified === 1) nextFocus = "repeat_verified_lesson_before_generalizing";

  return {
    experiences: experiences.length,
    verifiedExperiences: verified,
    unverifiedExperiences: unverified,
    blockedAttempts: blocked,
    unknownOutcomes: unknown,
    providerConflicts: conflicts,
    observations: observations.length,
    observationBaselines: baselines,
    changedObservations,
    unchangedObservations,
    lessons,
    nextFocus,
    confidenceClass: verified >= 2 && conflicts === 0 ? "bounded-repeatable" : "insufficient-for-generalization",
    authorityChangeRecommended: false,
  };
}
