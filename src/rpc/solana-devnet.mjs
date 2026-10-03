import { createHash } from "node:crypto";

export const SOLANA_DEVNET_RPC_URL = "https://api.devnet.solana.com";
export const SOLANA_DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX = new Map([...BASE58_ALPHABET].map((character, index) => [character, index]));

function providerId(endpoint) {
  return `rpc_${createHash("sha256").update(endpoint).digest("hex").slice(0, 12)}`;
}

function normalizeRpcError(error) {
  if (error == null) return "NONE";
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}

function encodeShortVec(value) {
  if (!Number.isInteger(value) || value < 0) throw new Error("shortvec value must be a non-negative integer");
  const output = [];
  let remaining = value;
  do {
    let element = remaining & 0x7f;
    remaining >>= 7;
    if (remaining > 0) element |= 0x80;
    output.push(element);
  } while (remaining > 0);
  return Buffer.from(output);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function accountDataFacts(account) {
  if (!account) return { dataLength: null, dataHash: null, discriminatorHex: null };
  const raw = Array.isArray(account.data) ? account.data[0] : null;
  if (typeof raw !== "string") return { dataLength: null, dataHash: null, discriminatorHex: null };
  const bytes = Buffer.from(raw, "base64");
  return {
    dataLength: bytes.length,
    dataHash: createHash("sha256").update(bytes).digest("hex"),
    discriminatorHex: bytes.length >= 8 ? bytes.subarray(0, 8).toString("hex") : null,
  };
}

function normalizeExpectedDiscriminators(entries) {
  if (entries == null) return [];
  if (!Array.isArray(entries)) throw new Error("expectedDiscriminators must be an array.");
  return entries.map((entry) => {
    if (!entry || typeof entry.name !== "string" || !/^[0-9a-f]{16}$/i.test(entry.discriminatorHex ?? "")) {
      throw new Error("Each expected discriminator must have a name and 8-byte hex discriminator.");
    }
    return { name: entry.name, discriminatorHex: entry.discriminatorHex.toLowerCase() };
  });
}

export function decodeBase58(value) {
  if (typeof value !== "string" || value.length === 0) throw new Error("base58 value is required");
  let numeric = 0n;
  for (const character of value) {
    const digit = BASE58_INDEX.get(character);
    if (digit == null) throw new Error(`invalid base58 character: ${character}`);
    numeric = numeric * 58n + BigInt(digit);
  }
  let body = Buffer.alloc(0);
  if (numeric > 0n) {
    let hex = numeric.toString(16);
    if (hex.length % 2 === 1) hex = `0${hex}`;
    body = Buffer.from(hex, "hex");
  }
  let leadingZeroes = 0;
  while (value[leadingZeroes] === "1") leadingZeroes += 1;
  return Buffer.concat([Buffer.alloc(leadingZeroes), body]);
}

export function buildUnsignedProgramProbe({ programId, recentBlockhash }) {
  const feePayer = decodeBase58(SYSTEM_PROGRAM_ID);
  const program = decodeBase58(programId);
  const blockhash = decodeBase58(recentBlockhash);
  for (const [label, value] of [["fee payer", feePayer], ["program", program], ["blockhash", blockhash]]) {
    if (value.length !== 32) throw new Error(`${label} must decode to 32 bytes`);
  }

  const message = Buffer.concat([
    Buffer.from([1, 0, 1]),
    encodeShortVec(2),
    feePayer,
    program,
    blockhash,
    encodeShortVec(1),
    Buffer.from([1]),
    encodeShortVec(0),
    encodeShortVec(0),
  ]);

  return Buffer.concat([
    encodeShortVec(1),
    Buffer.alloc(64),
    message,
  ]).toString("base64");
}

export class SolanaDevnetRpc {
  #endpoints;
  #fetch;
  #timeoutMs;
  #retries;
  #minRequestIntervalMs;
  #rateLimitBackoffMs;
  #lastRequestAt = new Map();

  constructor({
    endpoints = [SOLANA_DEVNET_RPC_URL],
    fetchFn = globalThis.fetch,
    timeoutMs = 10_000,
    retries = 3,
    minRequestIntervalMs = 300,
    rateLimitBackoffMs = 1_100,
  } = {}) {
    if (typeof fetchFn !== "function") throw new Error("A fetch implementation is required.");
    if (!Array.isArray(endpoints) || endpoints.length === 0) throw new Error("At least one Devnet RPC endpoint is required.");
    if (!Number.isFinite(minRequestIntervalMs) || minRequestIntervalMs < 0) throw new Error("minRequestIntervalMs must be non-negative.");
    if (!Number.isFinite(rateLimitBackoffMs) || rateLimitBackoffMs < 0) throw new Error("rateLimitBackoffMs must be non-negative.");
    this.#endpoints = [...new Set(endpoints.map((endpoint) => {
      const url = new URL(endpoint);
      if (url.protocol !== "https:") throw new Error("Devnet RPC endpoints must use HTTPS.");
      return url.toString();
    }))];
    this.#fetch = fetchFn;
    this.#timeoutMs = timeoutMs;
    this.#retries = retries;
    this.#minRequestIntervalMs = minRequestIntervalMs;
    this.#rateLimitBackoffMs = rateLimitBackoffMs;
  }

  endpoints() {
    return this.#endpoints.map((endpoint) => ({ provider: providerId(endpoint) }));
  }

  async #pace(endpoint) {
    const prior = this.#lastRequestAt.get(endpoint) ?? 0;
    const waitMs = Math.max(0, prior + this.#minRequestIntervalMs - Date.now());
    if (waitMs > 0) await sleep(waitMs);
    this.#lastRequestAt.set(endpoint, Date.now());
  }

  async #call(endpoint, method, params = []) {
    let lastError;
    for (let attempt = 0; attempt <= this.#retries; attempt += 1) {
      await this.#pace(endpoint);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
      try {
        const response = await this.#fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const error = new Error(`RPC HTTP ${response.status}`);
          error.rpcReached = true;
          error.httpStatus = response.status;
          error.retryAfterMs = retryAfterMs(response, this.#rateLimitBackoffMs);
          throw error;
        }
        const payload = await response.json();
        if (payload.error) {
          const error = new Error(`RPC ${method} error: ${payload.error.message ?? payload.error.code ?? "unknown"}`);
          error.rpcReached = true;
          error.rpcError = payload.error;
          throw error;
        }
        return payload.result;
      } catch (error) {
        lastError = error;
        if (attempt >= this.#retries) break;
        const waitMs = error.httpStatus === 429
          ? Math.max(error.retryAfterMs ?? 0, this.#rateLimitBackoffMs)
          : 200 * (2 ** attempt);
        await sleep(waitMs);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError;
  }

  async observeProgram(programId) {
    const providers = [];
    const providerObservations = [];

    for (const endpoint of this.#endpoints) {
      const provider = providerId(endpoint);
      try {
        const genesisHash = await this.#call(endpoint, "getGenesisHash");
        const slot = await this.#call(endpoint, "getSlot", [{ commitment: "confirmed" }]);
        const version = await this.#call(endpoint, "getVersion");
        const accountInfo = await this.#call(endpoint, "getAccountInfo", [programId, { encoding: "base64", commitment: "confirmed" }]);
        const account = accountInfo?.value ?? null;
        const state = {
          network: "solana-devnet",
          genesisHash,
          programId,
          programPresent: account !== null,
          programExecutable: account?.executable === true,
          programOwner: account?.owner ?? null,
          programSpace: account?.space ?? null,
        };
        providers.push({
          provider,
          status: "OBSERVED",
          slot,
          version: version?.["solana-core"] ?? null,
          genesisHash,
          programPresent: state.programPresent,
          programExecutable: state.programExecutable,
        });
        providerObservations.push({ provider, state });
      } catch (error) {
        providers.push({ provider, status: "UNAVAILABLE", error: error.message });
      }
    }

    const successful = providers.filter((entry) => entry.status === "OBSERVED");
    return {
      network: "solana-devnet",
      sourceMode: "live-readonly",
      clusterVerified: successful.length > 0 && successful.every((entry) => entry.genesisHash === SOLANA_DEVNET_GENESIS_HASH),
      configuredProviderCount: this.#endpoints.length,
      observedProviderCount: successful.length,
      providerFailureCount: this.#endpoints.length - successful.length,
      programId,
      programAccount: {
        present: successful.length > 0 && successful.every((entry) => entry.programPresent === true),
        executable: successful.length > 0 && successful.every((entry) => entry.programExecutable === true),
      },
      providers,
      providerObservations,
    };
  }

  async observeAccount(address, { expectedOwner = null, expectedDiscriminators = [] } = {}) {
    const discriminators = normalizeExpectedDiscriminators(expectedDiscriminators);
    const providers = [];
    const providerObservations = [];
    for (const endpoint of this.#endpoints) {
      const provider = providerId(endpoint);
      try {
        const accountInfo = await this.#call(endpoint, "getAccountInfo", [address, { encoding: "base64", commitment: "confirmed" }]);
        const account = accountInfo?.value ?? null;
        const dataFacts = accountDataFacts(account);
        const matchedType = account && discriminators.length > 0
          ? discriminators.find((entry) => entry.discriminatorHex === dataFacts.discriminatorHex)
          : null;
        const state = {
          address,
          present: account !== null,
          executable: account?.executable === true,
          owner: account?.owner ?? null,
          space: account?.space ?? null,
          lamports: account?.lamports ?? null,
          dataLength: dataFacts.dataLength,
          dataHash: dataFacts.dataHash,
          discriminatorHex: dataFacts.discriminatorHex,
          accountType: matchedType?.name ?? null,
          accountTypeMatches: account == null || discriminators.length === 0 ? null : matchedType != null,
          ownerMatches: expectedOwner == null ? null : account?.owner === expectedOwner,
        };
        providers.push({ provider, status: "OBSERVED", slot: accountInfo?.context?.slot ?? null, ...state });
        providerObservations.push({ provider, state });
      } catch (error) {
        providers.push({ provider, status: "UNAVAILABLE", error: error.message });
      }
    }
    return {
      address,
      expectedOwner,
      expectedAccountTypes: discriminators.map((entry) => entry.name),
      providers,
      providerObservations,
      observedProviderCount: providers.filter((entry) => entry.status === "OBSERVED").length,
    };
  }

  async simulateProgramProbe(programId) {
    const providerObservations = [];
    const simulations = [];

    for (const endpoint of this.#endpoints) {
      const provider = providerId(endpoint);
      try {
        const latest = await this.#call(endpoint, "getLatestBlockhash", [{ commitment: "confirmed" }]);
        const transaction = buildUnsignedProgramProbe({
          programId,
          recentBlockhash: latest.value.blockhash,
        });
        const result = await this.#call(endpoint, "simulateTransaction", [transaction, {
          encoding: "base64",
          commitment: "confirmed",
          sigVerify: false,
          replaceRecentBlockhash: false,
          innerInstructions: true,
        }]);
        const value = result?.value ?? {};
        const logs = Array.isArray(value.logs) ? value.logs : [];
        const state = {
          programId,
          rpcReached: true,
          simulationAccepted: true,
          errClass: normalizeRpcError(value.err),
          programInvoked: logs.some((line) => line.includes(programId)),
          transactionSigned: false,
          transactionSubmitted: false,
          realMoney: false,
        };
        providerObservations.push({ provider, state });
        simulations.push({
          provider,
          status: "SIMULATED",
          contextSlot: result?.context?.slot ?? null,
          unitsConsumed: value.unitsConsumed ?? null,
          logsObserved: logs.length,
          ...state,
        });
      } catch (error) {
        const rpcReached = error.rpcReached === true;
        const state = {
          programId,
          rpcReached,
          simulationAccepted: false,
          errClass: error.rpcError ? `RPC_ERROR_${error.rpcError.code ?? "UNKNOWN"}` : "TRANSPORT_ERROR",
          programInvoked: false,
          transactionSigned: false,
          transactionSubmitted: false,
          realMoney: false,
        };
        if (rpcReached) providerObservations.push({ provider, state });
        simulations.push({ provider, status: rpcReached ? "RPC_REJECTED" : "UNAVAILABLE", error: error.message, ...state });
      }
    }

    return {
      status: "DEVNET_SIMULATION_OBSERVED",
      programId,
      providerObservations,
      simulations,
      simulationRpcContact: simulations.some((entry) => entry.rpcReached === true),
      transactionSigned: false,
      transactionSubmitted: false,
      realMoney: false,
    };
  }
}
