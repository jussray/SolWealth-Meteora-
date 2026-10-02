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

  constructor({ clock = () => new Date().toISOString() } = {}) {
    this.#clock = clock;
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

  verify(entries = this.#entries) {
    let previousHash = "GENESIS";
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
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
