import { afterEach, describe, expect, it, vi } from "vitest";

import {
  authenticationRequiredEventName,
  notifyAuthenticationEstablished,
  notifyAuthenticationRequired,
  subscribeAuthenticationRequired
} from "../../src/client/authExpiry.js";
import { readJsonResponse } from "../../src/client/consoleApiClient.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authentication expiry notifications", () => {
  it("notifies every subscriber only after the server confirms the session expired", async () => {
    const browserWindow = Object.assign(new EventTarget(), {
      location: { href: "https://haitu.online/console" }
    });
    vi.stubGlobal("window", browserWindow);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      authEnabled: true,
      authenticated: false
    }), { status: 200 })));
    const listener = vi.fn();
    const unsubscribe = subscribeAuthenticationRequired(listener);

    notifyAuthenticationRequired(new Response(null, { status: 401 }), "/api/qc-summary");
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

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

  it("handles a malformed protected 401 response and confirms expiry", async () => {
    const browserWindow = Object.assign(new EventTarget(), {
      location: { href: "https://haitu.online/console" }
    });
    vi.stubGlobal("window", browserWindow);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      authEnabled: true,
      authenticated: false
    }), { status: 200 })));
    const listener = vi.fn();
    subscribeAuthenticationRequired(listener);

    await expect(readJsonResponse(new Response("not-json", { status: 401 }), "/api/qc-summary")).rejects.toThrow();

    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());
  });

  it("does not let a late 401 from an older request undo a successful new login", async () => {
    const browserWindow = Object.assign(new EventTarget(), {
      location: { href: "https://haitu.online/console" }
    });
    vi.stubGlobal("window", browserWindow);
    let resolveSessionCheck: ((response: Response) => void) | undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => {
      resolveSessionCheck = resolve;
    })));
    const listener = vi.fn();
    subscribeAuthenticationRequired(listener);

    notifyAuthenticationRequired(new Response(null, { status: 401 }), "/api/qc-summary");
    notifyAuthenticationEstablished(
      new Response(JSON.stringify({ authenticated: true }), { status: 200 }),
      "/api/auth/enter",
      { authEnabled: true, authenticated: true }
    );
    resolveSessionCheck?.(new Response(JSON.stringify({
      authEnabled: true,
      authenticated: false
    }), { status: 200 }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(listener).not.toHaveBeenCalled();
  });

  it("ignores a protected 401 when revalidation finds a valid current session", async () => {
    const browserWindow = Object.assign(new EventTarget(), {
      location: { href: "https://haitu.online/console" }
    });
    vi.stubGlobal("window", browserWindow);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      authEnabled: true,
      authenticated: true
    }), { status: 200 })));
    const listener = vi.fn();
    subscribeAuthenticationRequired(listener);

    notifyAuthenticationRequired(new Response(null, { status: 401 }), "/api/qc-summary");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(listener).not.toHaveBeenCalled();
  });
});
