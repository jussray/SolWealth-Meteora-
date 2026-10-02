export const BIRTH_LINEAGE = Object.freeze({
  schema: "solwealth-lineage-v1",
  child: "solwealth",
  inheritanceMode: "primitive-not-runtime-dependency",
  parents: Object.freeze([
    Object.freeze({
      system: "SleepWealth-Agent",
      repository: "jussray/SleepWealth-Agent",
      sha: "5ee4a05c3db6d838f29c9e299d2f6317bcf39064",
      inherited: Object.freeze([
        "capability-authority-separation",
        "observe-evaluate-propose-human-approval",
        "sandbox-experience",
        "outcome-receipts",
      ]),
    }),
    Object.freeze({
      system: "SolContinuity",
      repository: "jussray/solcontinuity",
      sha: "2225bcde284e0de010f7c35858f68ec28d2eeebc",
      inherited: Object.freeze([
        "provider-aware-quorum",
        "fail-closed-disagreement",
        "continuity-evidence",
      ]),
    }),
    Object.freeze({
      system: "Founder Control Room",
      repository: "jussray/founder-control-room",
      sha: "ba5a4057ab85d8f9c19d7a1da14ab47032258f3a",
      inherited: Object.freeze([
        "truth-before-decision",
        "bounded-actions",
        "no-self-certification",
      ]),
    }),
    Object.freeze({
      system: "Chief AI Machine",
      repository: "jussray/chief-ai-machine",
      sha: "d5bf821758709960d13283edcab0fa4734d273bc",
      inherited: Object.freeze([
        "evidence-decision-separation",
        "non-authorizing-observation",
      ]),
    }),
  ]),
});

export function birthCertificate() {
  return structuredClone(BIRTH_LINEAGE);
}
