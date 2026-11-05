import assert from "node:assert/strict";
import test from "node:test";

import { AccountModel, CUSTOMER_GATES, POOLED_GATES, evaluateAccountScope, verifyGateReceipt } from "../src/accounts/account-scope.mjs";
import { KEY_ENV_VAR, MAX_TTL_SECONDS, loadIssuerKey, mintGateReceipt, mintScopeReceipts } from "../src/accounts/receipt-issuer.mjs";

const KEY = "issuer-test-key-0123456789abcdef";
const ISSUER = "trusted-runtime";
const NOW = new Date("2030-01-01T00:00:00Z");

const mint = (over = {}) => mintGateReceipt({ gate: "customer_consent", subject: "cust-1", issuer: ISSUER, key: KEY, now: NOW, ...over });

test("minted receipt verifies against the account-scope verifier", () => {
  const r = mint();
  assert.equal(verifyGateReceipt(r, { gate: "customer_consent", subject: "cust-1", key: KEY, now: NOW, trustedIssuers: [ISSUER] }), null);
});

test("expiry is now plus ttl, serialized as UTC without milliseconds", () => {
  assert.equal(mint({ ttlSeconds: 3600 }).expires_at, "2030-01-01T01:00:00Z");
});

test("unknown gate, blank subject, bad ttl and invalid date are rejected", () => {
  assert.throws(() => mint({ gate: "live_trade" }), /unknown gate/);
  assert.throws(() => mint({ subject: "  " }), /subject/);
  for (const ttl of [0, -1, MAX_TTL_SECONDS + 1, 1.5, "60"]) assert.throws(() => mint({ ttlSeconds: ttl }), /ttlSeconds/);
  assert.throws(() => mint({ now: new Date("nope") }), /valid Date/);
});

test("short key fails closed at signing", () => {
  assert.throws(() => mint({ key: "short" }), /at least 32 bytes/);
});

test("customer scope becomes eligible from minted receipts and never authorizes live", () => {
  const receipts = mintScopeReceipts({ gates: CUSTOMER_GATES, subject: "cust-1", issuer: ISSUER, key: KEY, now: NOW });
  const r = evaluateAccountScope({ model: AccountModel.CUSTOMER_CONNECTED, subject: "cust-1", receipts, key: KEY, now: NOW, trustedIssuers: [ISSUER], capitalCeiling: 1000 });
  assert.equal(r.status, "ELIGIBLE_FOR_LIVE_GATE_REVIEW");
  assert.equal(r.live_execution_authorized, false);
});

test("pooled scope with one gate not minted stays blocked", () => {
  const receipts = mintScopeReceipts({ gates: POOLED_GATES.slice(0, -1), subject: "pool-1", issuer: ISSUER, key: KEY, now: NOW });
  const r = evaluateAccountScope({ model: AccountModel.POOLED_MANAGED, subject: "pool-1", receipts, key: KEY, now: NOW, trustedIssuers: [ISSUER], capitalCeiling: 1000 });
  assert.deepEqual(r.missing_or_invalid_gates, [POOLED_GATES[POOLED_GATES.length - 1]]);
});

test("duplicate gates are rejected", () => {
  assert.throws(() => mintScopeReceipts({ gates: ["customer_consent", "customer_consent"], subject: "c", issuer: ISSUER, key: KEY, now: NOW }), /duplicate/);
});

test("issuer key comes only from the environment and is never defaulted", () => {
  assert.throws(() => loadIssuerKey({}), /not set/);
  assert.throws(() => loadIssuerKey({ [KEY_ENV_VAR]: "short" }), /at least 32 bytes/);
  assert.equal(loadIssuerKey({ [KEY_ENV_VAR]: KEY }), KEY);
});
