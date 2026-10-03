import { SolanaDevnetRpc } from "../rpc/solana-devnet.mjs";

function candidateKey(observation) {
  if (observation?.status !== "DISCOVERED" || !observation.address) return null;
  return JSON.stringify({
    address: observation.address,
    accountType: observation.accountType ?? null,
    discriminatorHex: observation.discriminatorHex ?? null,
  });
}

export class DiscoveryQuorum {
  constructor({ endpoints, fetchFn = globalThis.fetch, rpcOptions = {}, requiredProviders = 2 } = {}) {
    if (!Array.isArray(endpoints) || endpoints.length === 0) {
      throw new Error("DiscoveryQuorum requires at least one endpoint.");
    }
    if (!Number.isInteger(requiredProviders) || requiredProviders < 2) {
      throw new Error("DiscoveryQuorum requires at least two agreeing providers.");
    }
    this.endpoints = [...new Set(endpoints)];
    this.fetchFn = fetchFn;
    this.rpcOptions = { ...rpcOptions };
    this.requiredProviders = requiredProviders;
  }

  async discover(programId, expectedDiscriminators) {
    const observations = [];

    for (const endpoint of this.endpoints) {
      const rpc = new SolanaDevnetRpc({
        ...this.rpcOptions,
        endpoints: [endpoint],
        fetchFn: this.fetchFn,
      });
      const provider = rpc.endpoints()[0]?.provider ?? "unknown_provider";
      try {
        const result = await rpc.discoverAccountByDiscriminator(programId, expectedDiscriminators);
        observations.push({
          provider,
          status: result.status,
          address: result.address,
          accountType: result.accountType,
          discriminatorHex: result.discriminatorHex,
        });
      } catch (error) {
        observations.push({
          provider,
          status: "UNAVAILABLE",
          address: null,
          accountType: null,
          discriminatorHex: null,
          error: error.message,
        });
      }
    }

    const discovered = observations.filter((entry) => entry.status === "DISCOVERED");
    const groups = new Map();
    for (const entry of discovered) {
      const key = candidateKey(entry);
      if (!key) continue;
      const group = groups.get(key) ?? { candidate: entry, providers: [] };
      group.providers.push(entry.provider);
      groups.set(key, group);
    }

    const eligible = [...groups.values()]
      .filter((group) => group.providers.length >= this.requiredProviders)
      .sort((left, right) => {
        if (right.providers.length !== left.providers.length) return right.providers.length - left.providers.length;
        return candidateKey(left.candidate).localeCompare(candidateKey(right.candidate));
      });

    let status;
    let selected = null;
    if (eligible.length === 1) {
      status = "VERIFIED";
      selected = eligible[0];
    } else if (eligible.length > 1 || discovered.length >= this.requiredProviders) {
      status = "CONFLICT";
    } else {
      status = "INSUFFICIENT_EVIDENCE";
    }

    return {
      status,
      programId,
      address: selected?.candidate.address ?? null,
      accountType: selected?.candidate.accountType ?? null,
      discriminatorHex: selected?.candidate.discriminatorHex ?? null,
      configuredProviderCount: this.endpoints.length,
      discoveredProviderCount: discovered.length,
      eligibleGroupCount: eligible.length,
      agreeingProviderCount: selected?.providers.length ?? 0,
      requiredProviders: this.requiredProviders,
      agreeingProviders: selected ? [...selected.providers].sort() : [],
      observations,
      candidateSelectionIsEvidence: false,
      providerAgreementVerified: status === "VERIFIED",
      authorityChanged: false,
      transactionSigned: false,
      transactionSubmitted: false,
      realMoney: false,
    };
  }
}
