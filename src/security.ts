import { timingSafeEqual } from "node:crypto";

const weakInternalKeyValues = new Set(["replace_with_shared_internal_key", "change_me_shared_internal_api_key_min_32_chars"]);
const simpleEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function hasStrongInternalKey(value?: string) {
  if (!value) return false;
  if (weakInternalKeyValues.has(value)) return false;
  return value.length >= 32;
}

export function isValidActorEmail(value: string) {
  return simpleEmailRegex.test(value);
}

function isLocalDev() {
  return process.env.NODE_ENV === "development";
}

export function validateStartupConfig() {
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!hasStrongInternalKey(internalKey)) {
    throw new Error("INTERNAL_API_KEY must be set to a strong value (32+ chars, non-placeholder)");
  }

  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error("REDIS_URL is required");
  }

  const devBypassEnabled = process.env.ALLOW_DEV_AUTH_BYPASS === "true";
  const devBypassEmail = process.env.DEV_AUTH_BYPASS_EMAIL?.trim();
  if (process.env.NODE_ENV === "production" && (devBypassEnabled || devBypassEmail)) {
    throw new Error("Dev auth bypass env vars are forbidden in production");
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword && !isLocalDev()) {
    throw new Error("ADMIN_PASSWORD is required outside development");
  }

  if (adminPassword && adminPassword.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters");
  }
}
