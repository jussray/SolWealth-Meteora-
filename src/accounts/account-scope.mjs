import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Account-scope evaluator, ported from SleepWealth-Agent execution/account_models.py.
 * Customer-connected and pooled-managed scopes never share authority.
 * Every gate is a trusted, subject-bound, unexpired HMAC receipt (key >= 32 bytes).
 * Result never grants live execution; it only makes a scope eligible for review.
 * Canonical JSON matches Python json.dumps(sort_keys, separators) for ASCII values.
 */
export const MIN_KEY_BYTES = 32;

export const AccountModel = Object.freeze({
  CUSTOMER_CONNECTED: "customer-connected",
  POOLED_MANAGED: "pooled-managed",
});

const CUSTOMER_GATES = Object.freeze(["customer_consent", "broker_oauth_grant", "account_risk_ceiling"]);
const POOLED_GATES = Object.freeze([
  "legal_entity",
  "regulatory_approval",
  "custody_agreement",
  "participant_agreements",
  "independent_risk_authority",
  "pooled_capital_ceiling",
  "participant_accounting",
]);
const REQUIRED = Object.freeze({
  [AccountModel.CUSTOMER_CONNECTED]: CUSTOMER_GATES,
  [AccountModel.POOLED_MANAGED]: POOLED_GATES,
});

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function keyBytes(value) {
  const buf = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.isBuffer(value) ? value : null;
  return buf && buf.length >= MIN_KEY_BYTES ? buf : null;
}

export function signReceipt(fields, key) {
  const k = keyBytes(key);
  if (!k) throw new Error("receipt key must be at least 32 bytes");
  return createHmac("sha256", k).update(canonical(fields)).digest("hex");
}

function parseTime(value) {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

export function verifyGateReceipt(receipt, { gate, subject, key, now, trustedIssuers }) {
  if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)) return "receipt_not_object";
  const k = keyBytes(key);
  if (!k) return "trusted_key_missing_or_short";
  if (receipt.gate !== gate) return "gate_mismatch";
  if (receipt.subject !== subject) return "subject_mismatch";
  if (!trustedIssuers.includes(receipt.issued_by)) return "untrusted_issuer";
  const expires = parseTime(receipt.expires_at);
  if (expires === null) return "expiry_unparseable";
  if (now.getTime() >= expires) return "receipt_expired";
  if (typeof receipt.signature !== "string") return "signature_missing";
  const { signature, ...fields } = receipt;
  const expected = createHmac("sha256", k).update(canonical(fields)).digest("hex");
  const a = Buffer.from(signature.toLowerCase(), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return "signature_invalid";
  return null;
}

export function evaluateAccountScope({ model, subject, receipts, key, now, trustedIssuers, capitalCeiling }) {
  const base = { model, subject, live_execution_authorized: false, authorizes_real_money: false };
  if (!REQUIRED[model]) return { ...base, status: "REJECTED", reasons: ["unknown_model"] };
  if (typeof subject !== "string" || subject.trim() === "") return { ...base, status: "REJECTED", reasons: ["subject_required"] };
  if (typeof capitalCeiling !== "number" || !Number.isFinite(capitalCeiling) || capitalCeiling <= 0) {
    return { ...base, status: "REJECTED", reasons: ["capital_ceiling_must_be_positive"] };
  }
  const list = Array.isArray(receipts) ? receipts : [];
  const reasons = {};
  for (const gate of REQUIRED[model]) {
    const candidates = list.filter((r) => r && typeof r === "object" && r.gate === gate);
    if (candidates.length === 0) {
      reasons[gate] = "missing_receipt";
      continue;
    }
    const failures = candidates.map((r) => verifyGateReceipt(r, { gate, subject, key, now, trustedIssuers }));
    if (!failures.includes(null)) reasons[gate] = failures[0];
  }
  const missing = Object.keys(reasons).sort();
  if (missing.length) {
    return {
      ...base,
      status: "BLOCKED",
      missing_or_invalid_gates: missing,
      reasons: missing.map((g) => `${g}:${reasons[g]}`),
      capital_ceiling: capitalCeiling,
    };
  }
  return { ...base, status: "ELIGIBLE_FOR_LIVE_GATE_REVIEW", reasons: [], capital_ceiling: capitalCeiling };
}

export { CUSTOMER_GATES, POOLED_GATES };
