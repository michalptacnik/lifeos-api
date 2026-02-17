import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateStartupConfig } from "./security.js";

describe("security startup validation", () => {
  beforeEach(() => {
    vi.stubEnv("INTERNAL_API_KEY", "12345678901234567890123456789012");
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379");
    vi.stubEnv("ADMIN_PASSWORD", "supersecure");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_DEV_AUTH_BYPASS", "false");
    vi.stubEnv("DEV_AUTH_BYPASS_EMAIL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts valid non-production defaults", () => {
    expect(() => validateStartupConfig()).not.toThrow();
  });

  it("rejects production startup when bypass flag is enabled", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_AUTH_BYPASS", "true");
    expect(() => validateStartupConfig()).toThrow("forbidden in production");
  });

  it("rejects production startup when bypass email is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_AUTH_BYPASS_EMAIL", "dev@example.com");
    expect(() => validateStartupConfig()).toThrow("forbidden in production");
  });
});
