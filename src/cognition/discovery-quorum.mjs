import { createHash } from "node:crypto";

import { encodeBase58 } from "../rpc/solana-devnet.mjs";

function providerId(endpoint) {
  return `rpc_${createHash("sha256").update(endpoint).digest("hex").slice(0, 12)}`;
}

function candidateKey(candidate) {
  if (!candidate?.address) return null;
  return JSON.stringify({
    address: candidate.address,
    accountType: candidate.accountType ?? null,
    discriminatorHex: candidate.discriminatorHex ?? null,
  });
}

function normalizeDiscriminators(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("DiscoveryQuorum requires at least one account discriminator.");
  }
  return entries.map((entry) => {
    if (!entry || typeof entry.name !== "string" || !/^[0-9a-f]{16}$/i.test(entry.discriminatorHex ?? "")) {
      throw new Error("Each discovery discriminator must have a name and 8-byte hex discriminator.");
    }
    return {
      name: entry.name,
      discriminatorHex: entry.discriminatorHex.toLowerCase(),
    };
  });
}

function retryAfterMs(response, fallbackMs) {
  const raw = response?.headers?.get?.("retry-after");
  if (!raw) return fallbackMs;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return fallbackMs;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DiscoveryQuorum {
  #lastRequestAt = new Map();

  constructor({ endpoints, fetchFn = globalThis.fetch, rpcOptions = {}, requiredProviders = 2 } = {}) {
    if (!Array.isArray(endpoints) || endpoints.length === 0) {
      throw new Error("DiscoveryQuorum requires at least one endpoint.");
    }
    if (typeof fetchFn !== "function") throw new Error("DiscoveryQuorum requires a fetch implementation.");
    if (!Number.isInteger(requiredProviders) || requiredProviders < 2) {
      throw new Error("DiscoveryQuorum requires at least two agreeing providers.");
    }

    this.endpoints = [...new Set(endpoints.map((endpoint) => {
      const url = new URL(endpoint);
      if (url.protocol !== "https:") throw new Error("Discovery endpoints must use HTTPS.");
      return url.toString();
    }))];
    this.fetchFn = fetchFn;
    this.requiredProviders = requiredProviders;
    this.timeoutMs = rpcOptions.timeoutMs ?? 10_000;
    this.retries = rpcOptions.retries ?? 3;
    this.minRequestIntervalMs = rpcOptions.minRequestIntervalMs ?? 300;
    this.rateLimitBackoffMs = rpcOptions.rateLimitBackoffMs ?? 1_100;
  }

  async #pace(endpoint) {
    const prior = this.#lastRequestAt.get(endpoint) ?? 0;
    const waitMs = Math.max(0, prior + this.minRequestIntervalMs - Date.now());
    if (waitMs > 0) await sleep(waitMs);
    this.#lastRequestAt.set(endpoint, Date.now());
  }

  async #call(endpoint, method, params) {
    let lastError;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      await this.#pace(endpoint);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchFn(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const error = new Error(`RPC HTTP ${response.status}`);
          error.httpStatus = response.status;
          error.retryAfterMs = retryAfterMs(response, this.rateLimitBackoffMs);
          throw error;
        }
        const payload = await response.json();
        if (payload.error) {
          throw new Error(`RPC ${method} error: ${payload.error.message ?? payload.error.code ?? "unknown"}`);
        }
        return payload.result;
      } catch (error) {
        lastError = error;
        if (attempt >= this.retries) break;
        const waitMs = error.httpStatus === 429
          ? Math.max(error.retryAfterMs ?? 0, this.rateLimitBackoffMs)
          : 200 * (2 ** attempt);
        await sleep(waitMs);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError;
  }

  async #discoverProvider(endpoint, programId, discriminators) {
    const provider = providerId(endpoint);
    const attempts = [];

    for (const discriminator of discriminators) {
      const bytes = encodeBase58(Buffer.from(discriminator.discriminatorHex, "hex"));
      try {
        const result = await this.#call(endpoint, "getProgramAccounts", [programId, {
          encoding: "base64",
          commitment: "confirmed",
          dataSlice: { offset: 0, length: 0 },
          filters: [{ memcmp: { offset: 0, bytes } }],
        }]);
        const addresses = [...new Set((Array.isArray(result) ? result : [])
          .map((entry) => entry?.pubkey)
          .filter((address) => typeof address === "string" && address.length > 0))]
          .sort();
        attempts.push({
          status: "OBSERVED",
          accountType: discriminator.name,
          matchCount: addresses.length,
        });

        if (addresses.length > 0) {
          return {
            provider,
            status: "DISCOVERED",
            candidates: addresses.map((address) => ({
              address,
              accountType: discriminator.name,
              discriminatorHex: discriminator.discriminatorHex,
            })),
            attempts,
          };
        }
      } catch (error) {
        attempts.push({
          status: "UNAVAILABLE",
          accountType: discriminator.name,
          error: error.message,
        });
      }
    }

    const unavailableOnly = attempts.length > 0 && attempts.every((attempt) => attempt.status === "UNAVAILABLE");
    return {
      provider,
      status: unavailableOnly ? "UNAVAILABLE" : "NOT_FOUND",
      candidates: [],
      attempts,
    };
  }

  async discover(programId, expectedDiscriminators) {
    const discriminators = normalizeDiscriminators(expectedDiscriminators);
    const observations = [];

    for (const endpoint of this.endpoints) {
      observations.push(await this.#discoverProvider(endpoint, programId, discriminators));
    }

    const discovered = observations.filter((entry) => entry.status === "DISCOVERED");
    if (discovered.length < this.requiredProviders) {
      return this.#receipt({
        status: "INSUFFICIENT_EVIDENCE",
        programId,
        discovered,
        observations,
      });
    }

    let commonKeys = new Set(discovered[0].candidates.map(candidateKey).filter(Boolean));
    for (const observation of discovered.slice(1)) {
      const providerKeys = new Set(observation.candidates.map(candidateKey).filter(Boolean));
      commonKeys = new Set([...commonKeys].filter((key) => providerKeys.has(key)));
    }

    if (commonKeys.size === 0) {
      return this.#receipt({
        status: "CONFLICT",
        programId,
        discovered,
        observations,
      });
    }

    const selectedKey = [...commonKeys].sort()[0];
    const selected = discovered[0].candidates.find((candidate) => candidateKey(candidate) === selectedKey);
    return this.#receipt({
      status: "VERIFIED",
      programId,
      discovered,
      observations,
      selected,
      commonCandidateCount: commonKeys.size,
    });
  }

  #receipt({ status, programId, discovered, observations, selected = null, commonCandidateCount = 0 }) {
    return {
      status,
      programId,
      address: selected?.address ?? null,
      accountType: selected?.accountType ?? null,
      discriminatorHex: selected?.discriminatorHex ?? null,
      configuredProviderCount: this.endpoints.length,
      discoveredProviderCount: discovered.length,
      agreeingProviderCount: status === "VERIFIED" ? discovered.length : 0,
      requiredProviders: this.requiredProviders,
      commonCandidateCount,
      agreeingProviders: status === "VERIFIED"
        ? discovered.map((entry) => entry.provider).sort()
        : [],
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
