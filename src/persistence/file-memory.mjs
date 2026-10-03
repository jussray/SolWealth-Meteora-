import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import { MemoryLedger } from "../memory.mjs";

const LEDGER_SCHEMA = "solwealth-memory-v1";
const ANCHOR_SCHEMA = "solwealth-memory-anchor-v1";

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${label}_invalid: ${error.message}`);
  }
}

function atomicWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temporary, path);
}

function loadPair(path, anchorPath) {
  const ledgerExists = existsSync(path);
  const anchorExists = existsSync(anchorPath);
  if (ledgerExists !== anchorExists) {
    throw new Error("memory_store_pair_incomplete");
  }
  if (!ledgerExists) return { entries: [], anchor: null };

  const ledger = readJson(path, "memory_ledger");
  const anchor = readJson(anchorPath, "memory_anchor");
  if (ledger?.schema !== LEDGER_SCHEMA || !Array.isArray(ledger.entries)) {
    throw new Error("memory_ledger_schema_invalid");
  }
  if (anchor?.schema !== ANCHOR_SCHEMA) {
    throw new Error("memory_anchor_schema_invalid");
  }
  return { entries: ledger.entries, anchor };
}

export class PersistentMemoryLedger extends MemoryLedger {
  #path;
  #anchorPath;

  constructor({ path, anchorPath = path ? `${path}.anchor` : null, clock } = {}) {
    if (!path) throw new Error("memory_path_required");
    const loaded = loadPair(path, anchorPath);
    super({ clock, entries: loaded.entries });
    this.#path = path;
    this.#anchorPath = anchorPath;

    if (loaded.anchor) {
      const expected = this.anchor();
      if (
        loaded.anchor.entryCount !== expected.entryCount
        || loaded.anchor.headHash !== expected.headHash
      ) {
        throw new Error("memory_anchor_mismatch");
      }
    }
  }

  static open(options) {
    return new PersistentMemoryLedger(options);
  }

  append(kind, payload) {
    const entry = super.append(kind, payload);
    this.#persist();
    return entry;
  }

  seal() {
    this.#persist();
    return this.anchor();
  }

  anchor() {
    return {
      schema: ANCHOR_SCHEMA,
      entryCount: this.size(),
      headHash: this.head()?.hash ?? "GENESIS",
    };
  }

  paths() {
    return { ledgerPath: this.#path, anchorPath: this.#anchorPath };
  }

  #persist() {
    const entries = this.entries();
    atomicWrite(this.#path, { schema: LEDGER_SCHEMA, entries });
    atomicWrite(this.#anchorPath, this.anchor());
  }
}
