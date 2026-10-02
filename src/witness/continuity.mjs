import { createHash } from "node:crypto";
import { stableStringify } from "../memory.mjs";

function fingerprint(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export class ContinuityWitness {
  verify(observations, { quorum = 2 } = {}) {
    const distinctProviders = new Map();
    for (const observation of observations ?? []) {
      if (!observation?.provider) continue;
      if (distinctProviders.has(observation.provider)) continue;
      distinctProviders.set(observation.provider, observation.state);
    }

    if (distinctProviders.size < quorum) {
      return {
        status: "INSUFFICIENT_EVIDENCE",
        providerCount: distinctProviders.size,
        quorum,
        verified: false,
      };
    }

    const groups = new Map();
    for (const [provider, state] of distinctProviders) {
      const fp = fingerprint(state);
      const group = groups.get(fp) ?? { fingerprint: fp, providers: [], state };
      group.providers.push(provider);
      groups.set(fp, group);
    }

    const winner = [...groups.values()].sort((a, b) => b.providers.length - a.providers.length)[0];
    if (!winner || winner.providers.length < quorum) {
      return {
        status: "CONFLICT",
        providerCount: distinctProviders.size,
        quorum,
        verified: false,
        groups: [...groups.values()].map(({ fingerprint: fp, providers }) => ({ fingerprint: fp, providers })),
      };
    }

    return {
      status: "VERIFIED",
      providerCount: distinctProviders.size,
      quorum,
      verified: true,
      fingerprint: winner.fingerprint,
      agreeingProviders: winner.providers,
      state: structuredClone(winner.state),
    };
  }
}
