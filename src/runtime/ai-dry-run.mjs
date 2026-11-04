import { createHash } from "node:crypto";
import { AuthorityGate, CAPABILITY_CATALOG } from "../authority.mjs";
import { stableStringify } from "../memory.mjs";

/**
 * AI dry-run seam. An AI proposer (stub today, model later) may only PROPOSE.
 * This module validates the proposal shape, then asks the existing AuthorityGate.
 * It never signs, broadcasts, or moves money. Approval must come from a human
 * caller argument, never from the proposal itself.
 */
export const AI_DRY_RUN_CONTRACT = "solwealth/ai-dry-run-receipt@v1";

const ALLOWED_TOP_LEVEL_FIELDS = new Set(["capability", "environment", "params", "rationale"]);
const FORBIDDEN_PARAM_KEY = /(private|secret|seed|mnemonic|keypair|signer|sign|broadcast|submit|wallet|mainnet|live|money|transfer|withdraw|payment|approv)/i;

function digest(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function scanParams(value, path, problems) {
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_PARAM_KEY.test(key)) problems.push(`forbidden_param:${path}${key}`);
      scanParams(value[key], `${path}${key}.`, problems);
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => scanParams(item, `${path}${i}.`, problems));
  }
}

export function validateProposal(proposal) {
  if (!isPlainObject(proposal)) return ["proposal_must_be_object"];
  const problems = [];
  for (const key of Object.keys(proposal)) {
    if (!ALLOWED_TOP_LEVEL_FIELDS.has(key)) problems.push(`unexpected_field:${key}`);
  }
  if (typeof proposal.capability !== "string" || !CAPABILITY_CATALOG.includes(proposal.capability)) {
    problems.push("unknown_capability");
  }
  if (typeof proposal.environment !== "string" || proposal.environment.length === 0) {
    problems.push("environment_required");
  }
  if (proposal.params !== undefined) {
    if (!isPlainObject(proposal.params)) problems.push("params_must_be_object");
    else scanParams(proposal.params, "", problems);
  }
  return problems;
}

function receipt(fields) {
  return Object.freeze({
    contract: AI_DRY_RUN_CONTRACT,
    liveExecutionAuthorized: false,
    authorizesRealMoney: false,
    authorizesSigning: false,
    authorizesExternalEffect: false,
    ...fields,
  });
}

/**
 * @param {object} args
 * @param {object} args.proposal  AI-authored proposal. Must not carry approval fields.
 * @param {object|null} args.approval  Human approval object supplied by the caller, never by the proposer.
 * @param {AuthorityGate} [args.authority]
 */
export function runAiProposal({ proposal, approval = null, authority = new AuthorityGate() } = {}) {
  const fingerprint = digest(proposal ?? null);
  const problems = validateProposal(proposal);
  if (problems.length) {
    return receipt({ status: "REJECTED", reasons: problems, fingerprint });
  }

  const decision = authority.authorize({
    capability: proposal.capability,
    environment: proposal.environment,
    approval,
  });
  if (decision.status !== "PERMITTED") {
    return receipt({ status: "DENIED", reasons: [decision.reason], fingerprint });
  }

  return receipt({
    status: "SIMULATED",
    reasons: [],
    fingerprint,
    capability: proposal.capability,
    environment: proposal.environment,
    approvalId: decision.approvalId,
    effectClass: "simulation_only",
  });
}
