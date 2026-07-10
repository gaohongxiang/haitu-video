import { describe, expect, it } from "vitest";

import { createAtomicMemoryRateLimitStorage } from "../../src/server/auth/betterAuthStore.js";

describe("Better Auth memory rate-limit storage", () => {
  it("admits no more than the configured maximum under concurrent consumption", async () => {
    const storage = createAtomicMemoryRateLimitStorage(() => 1_000);

    const decisions = await Promise.all(
      Array.from({ length: 40 }, () => storage.consume("sign-in", { window: 60, max: 30 }))
    );

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(30);
    expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(10);
    expect(decisions.at(-1)).toEqual({ allowed: false, retryAfter: 60 });
  });

  it("opens a fresh bucket after the configured window", async () => {
    let now = 1_000;
    const storage = createAtomicMemoryRateLimitStorage(() => now);

    expect(await storage.consume("verify-email", { window: 5, max: 1 })).toEqual({
      allowed: true,
      retryAfter: null
    });
    expect(await storage.consume("verify-email", { window: 5, max: 1 })).toEqual({
      allowed: false,
      retryAfter: 5
    });

    now += 5_000;

    expect(await storage.consume("verify-email", { window: 5, max: 1 })).toEqual({
      allowed: true,
      retryAfter: null
    });
  });
});
