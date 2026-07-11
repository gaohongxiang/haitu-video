import { afterEach, describe, expect, it, vi } from "vitest";

import {
  authenticationRequiredEventName,
  notifyAuthenticationRequired,
  subscribeAuthenticationRequired
} from "../../src/client/authExpiry.js";
import { readJsonResponse } from "../../src/client/consoleApiClient.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authentication expiry notifications", () => {
  it("notifies every subscriber for protected API 401 responses", () => {
    const browserWindow = Object.assign(new EventTarget(), {
      location: { href: "https://haitu.online/console" }
    });
    vi.stubGlobal("window", browserWindow);
    const listener = vi.fn();
    const unsubscribe = subscribeAuthenticationRequired(listener);

    notifyAuthenticationRequired(new Response(null, { status: 401 }), "/api/qc-summary");

    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    browserWindow.dispatchEvent(new Event(authenticationRequiredEventName));
    expect(listener).toHaveBeenCalledOnce();
  });

  it("does not treat expected authentication form failures as expired sessions", () => {
    const browserWindow = Object.assign(new EventTarget(), {
      location: { href: "https://haitu.online/console" }
    });
    vi.stubGlobal("window", browserWindow);
    const listener = vi.fn();
    subscribeAuthenticationRequired(listener);

    notifyAuthenticationRequired(new Response(null, { status: 401 }), "/api/auth/enter");

    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies before parsing a malformed protected 401 response", async () => {
    const browserWindow = Object.assign(new EventTarget(), {
      location: { href: "https://haitu.online/console" }
    });
    vi.stubGlobal("window", browserWindow);
    const listener = vi.fn();
    subscribeAuthenticationRequired(listener);

    await expect(readJsonResponse(new Response("not-json", { status: 401 }), "/api/qc-summary")).rejects.toThrow();

    expect(listener).toHaveBeenCalledOnce();
  });
});
