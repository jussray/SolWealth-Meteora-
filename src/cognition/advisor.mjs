const ALLOWED_FOCI = new Set([
  "establish_baseline",
  "inspect_state_change",
  "repeat_verified_observation",
  "gather_more_independent_evidence",
]);

function deterministicAdvice({ observation }) {
  const noveltyClass = observation?.change?.noveltyClass ?? "BASELINE";
  if (observation?.observationWitness?.verified !== true) {
    return {
      focus: "gather_more_independent_evidence",
      summary: "Evidence is not independently verified yet; gather another agreeing observation before generalizing.",
      confidenceClass: "insufficient-evidence",
    };
  }
  if (noveltyClass === "CHANGED") {
    return {
      focus: "inspect_state_change",
      summary: "A tracked DBC account changed semantically; compare the verified before/after fingerprints before any new experiment.",
      confidenceClass: "bounded-verified-change",
    };
  }
  if (noveltyClass === "UNCHANGED") {
    return {
      focus: "repeat_verified_observation",
      summary: "The tracked DBC state is unchanged; repeat evidence can strengthen pattern confidence without expanding authority.",
      confidenceClass: "bounded-repeat-observation",
    };
  }
  return {
    focus: "establish_baseline",
    summary: "This is the first semantic snapshot for the tracked DBC state; retain it as a baseline.",
    confidenceClass: "bounded-baseline",
  };
}

function sanitizeModelAdvice(raw, fallback) {
  if (!raw || typeof raw !== "object") return fallback;
  const focus = ALLOWED_FOCI.has(raw.focus) ? raw.focus : fallback.focus;
  const summary = typeof raw.summary === "string" && raw.summary.trim()
    ? raw.summary.trim().slice(0, 500)
    : fallback.summary;
  const confidenceClass = typeof raw.confidenceClass === "string" && raw.confidenceClass.trim()
    ? raw.confidenceClass.trim().slice(0, 120)
    : fallback.confidenceClass;
  return { focus, summary, confidenceClass };
}

export class BoundedCognitionAdvisor {
  constructor({ model = null } = {}) {
    if (model != null && typeof model !== "function") {
      throw new Error("model advisor must be a synchronous function when provided");
    }
    this.model = model;
  }

  advise(context) {
    const fallback = deterministicAdvice(context);
    let advisory = fallback;
    let source = "deterministic";
    if (this.model) {
      const raw = this.model(structuredClone(context));
      if (raw && typeof raw.then === "function") {
        throw new Error("asynchronous model advisors are not supported by the synchronous InfantMind");
      }
      advisory = sanitizeModelAdvice(raw, fallback);
      source = "model-constrained";
    }
    return {
      source,
      ...advisory,
      canSelfAuthorize: false,
      canSign: false,
      canSubmit: false,
      authorityChanged: false,
    };
  }
}
