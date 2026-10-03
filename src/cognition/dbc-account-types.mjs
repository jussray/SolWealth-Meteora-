import { createHash } from "node:crypto";

export function anchorAccountDiscriminatorHex(accountName) {
  if (typeof accountName !== "string" || accountName.length === 0) {
    throw new Error("Anchor account name is required.");
  }
  return createHash("sha256")
    .update(`account:${accountName}`)
    .digest()
    .subarray(0, 8)
    .toString("hex");
}

function descriptor(name) {
  return Object.freeze({ name, discriminatorHex: anchorAccountDiscriminatorHex(name) });
}

export const DBC_CONFIG_ACCOUNT_TYPES = Object.freeze([
  descriptor("PoolConfig"),
  descriptor("ConfigWithTransferHook"),
]);

export const DBC_POOL_ACCOUNT_TYPES = Object.freeze([
  descriptor("VirtualPool"),
  descriptor("TransferHookPool"),
]);
