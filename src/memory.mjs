import { createHash } from "node:crypto";

function normalized(value) {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalized(value[key])]),
    );
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(normalized(value));
}

function digest(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export class MemoryLedger {
  #entries = [];
  #clock;

  constructor({ clock = () => new Date().toISOString(), entries = [] } = {}) {
    this.#clock = clock;
    if (!Array.isArray(entries)) throw new Error("memory_entries_must_be_array");
    const candidate = structuredClone(entries);
    if (!this.verify(candidate)) throw new Error("memory_integrity_failure");
    this.#entries = candidate.map((entry) => Object.freeze(entry));
  }

  append(kind, payload) {
    const previousHash = this.#entries.at(-1)?.hash ?? "GENESIS";
    const body = {
      sequence: this.#entries.length + 1,
      at: this.#clock(),
      kind,
      previousHash,
      payload: structuredClone(payload),
    };
    const entry = Object.freeze({ ...body, hash: digest(body) });
    this.#entries.push(entry);
    return structuredClone(entry);
  }

  entries() {
    return structuredClone(this.#entries);
  }

  size() {
    return this.#entries.length;
  }

  head() {
    return structuredClone(this.#entries.at(-1) ?? null);
  }

  verify(entries = this.#entries) {
    if (!Array.isArray(entries)) return false;
    let previousHash = "GENESIS";
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!entry || typeof entry !== "object") return false;
      const body = {
        sequence: index + 1,
        at: entry.at,
        kind: entry.kind,
        previousHash,
        payload: entry.payload,
      };
      if (entry.sequence !== index + 1) return false;
      if (entry.previousHash !== previousHash) return false;
      if (entry.hash !== digest(body)) return false;
      previousHash = entry.hash;
    }
    return true;
  }
}
