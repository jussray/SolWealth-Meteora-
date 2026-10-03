import { createHash } from "node:crypto";
import { stableStringify } from "../memory.mjs";

export function digestFingerprint(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function semanticAccount(state) {
  if (!state) return null;
  return {
    address: state.address ?? null,
    observed: state.observed ?? false,
    observedProviderCount: state.observedProviderCount ?? 0,
    present: state.present ?? null,
    ownedByDbcProgram: state.ownedByDbcProgram ?? null,
    executable: state.executable ?? null,
    owner: state.owner ?? null,
    space: state.space ?? null,
    lamports: state.lamports ?? null,
    dataLength: state.dataLength ?? null,
    dataHash: state.dataHash ?? null,
  };
}

export function semanticObservationState(state) {
  return {
    environment: state?.environment ?? null,
    sourceMode: state?.sourceMode ?? null,
    programId: state?.programId ?? null,
    clusterVerified: state?.clusterVerified ?? null,
    configState: semanticAccount(state?.configState),
    poolState: semanticAccount(state?.poolState),
  };
}

function changedFields(before, after) {
  const beforeObject = before ?? {};
  const afterObject = after ?? {};
  return [...new Set([...Object.keys(beforeObject), ...Object.keys(afterObject)])]
    .filter((key) => stableStringify(beforeObject[key]) !== stableStringify(afterObject[key]))
    .sort();
}

export function compareObservedState(previousState, currentState) {
  const currentSemantic = semanticObservationState(currentState);
  const currentFingerprint = digestFingerprint(currentSemantic);

  if (!previousState) {
    return {
      noveltyClass: "BASELINE",
      previousFingerprint: null,
      currentFingerprint,
      changedTargets: [],
      changes: [],
    };
  }

  const previousSemantic = semanticObservationState(previousState);
  const previousFingerprint = digestFingerprint(previousSemantic);
  const changes = [];

  for (const target of ["configState", "poolState"]) {
    const fields = changedFields(previousSemantic[target], currentSemantic[target]);
    if (fields.length > 0) {
      changes.push({
        target,
        changedFields: fields,
        beforeFingerprint: digestFingerprint(previousSemantic[target]),
        afterFingerprint: digestFingerprint(currentSemantic[target]),
      });
    }
  }

  const programFields = ["environment", "sourceMode", "programId", "clusterVerified"]
    .filter((key) => stableStringify(previousSemantic[key]) !== stableStringify(currentSemantic[key]));
  if (programFields.length > 0) {
    changes.unshift({
      target: "program",
      changedFields: programFields,
      beforeFingerprint: digestFingerprint({
        environment: previousSemantic.environment,
        sourceMode: previousSemantic.sourceMode,
        programId: previousSemantic.programId,
        clusterVerified: previousSemantic.clusterVerified,
      }),
      afterFingerprint: digestFingerprint({
        environment: currentSemantic.environment,
        sourceMode: currentSemantic.sourceMode,
        programId: currentSemantic.programId,
        clusterVerified: currentSemantic.clusterVerified,
      }),
    });
  }

  return {
    noveltyClass: changes.length > 0 ? "CHANGED" : "UNCHANGED",
    previousFingerprint,
    currentFingerprint,
    changedTargets: changes.map((change) => change.target),
    changes,
  };
}
