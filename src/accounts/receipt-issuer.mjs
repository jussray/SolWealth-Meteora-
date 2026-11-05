import { CUSTOMER_GATES, POOLED_GATES, MIN_KEY_BYTES, signReceipt } from "./account-scope.mjs";

/**
 * Trusted-runtime receipt issuer, mirroring SleepWealth execution/receipt_issuer.py.
 * Minting does not grant authority: the verifier still checks issuer trust and key.
 * The key comes only from SOLWEALTH_RECEIPT_KEY and fails closed when missing or short.
 */
export const KEY_ENV_VAR = "SOLWEALTH_RECEIPT_KEY";
export const MAX_TTL_SECONDS = 24 * 60 * 60;
const KNOWN_GATES = new Set([...CUSTOMER_GATES, ...POOLED_GATES]);

export function loadIssuerKey(env = process.env) {
  const raw = env[KEY_ENV_VAR];
  if (!raw) throw new Error(`${KEY_ENV_VAR} is not set; refusing to mint receipts`);
  if (Buffer.byteLength(raw, "utf8") < MIN_KEY_BYTES) {
    throw new Error(`${KEY_ENV_VAR} must be at least ${MIN_KEY_BYTES} bytes`);
  }
  return raw;
}

export function mintGateReceipt({ gate, subject, issuer, key, now, ttlSeconds = MAX_TTL_SECONDS }) {
  if (!KNOWN_GATES.has(gate)) throw new Error(`unknown gate: ${gate}`);
  if (typeof subject !== "string" || subject.trim() === "") throw new Error("subject is required");
  if (typeof issuer !== "string" || issuer.trim() === "") throw new Error("issuer is required");
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > MAX_TTL_SECONDS) {
    throw new Error(`ttlSeconds must be an integer between 1 and ${MAX_TTL_SECONDS}`);
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error("now must be a valid Date");
  const expires = new Date(Math.floor(now.getTime() / 1000) * 1000 + ttlSeconds * 1000);
  const fields = { gate, subject, issued_by: issuer, expires_at: expires.toISOString().replace(".000Z", "Z") };
  return { ...fields, signature: signReceipt(fields, key) };
}

export function mintScopeReceipts({ gates, subject, issuer, key, now, ttlSeconds = MAX_TTL_SECONDS }) {
  if (new Set(gates).size !== gates.length) throw new Error("duplicate gate in request");
  return gates.map((gate) => mintGateReceipt({ gate, subject, issuer, key, now, ttlSeconds }));
}
