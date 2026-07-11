export const authenticationRequiredEventName = "haitu:authentication-required";

let authenticationGeneration = 0;
const pendingAuthenticationChecks = new Map<number, Promise<void>>();

export function notifyAuthenticationRequired(response: Response, requestPath?: string): void {
  if (response.status !== 401 || typeof window === "undefined") return;

  const pathname = authenticationRequestPath(response, requestPath);
  if (pathname.startsWith("/api/auth/")) return;

  const generation = authenticationGeneration;
  if (pendingAuthenticationChecks.has(generation)) return;

  const check = confirmAuthenticationRequired(generation).finally(() => {
    pendingAuthenticationChecks.delete(generation);
  });
  pendingAuthenticationChecks.set(generation, check);
}

export function notifyAuthenticationEstablished(response: Response, requestPath: string | undefined, body: unknown): void {
  if (!response.ok || !isAuthenticatedSession(body) || typeof window === "undefined") return;

  const pathname = authenticationRequestPath(response, requestPath);
  if (pathname !== "/api/auth/enter" && pathname !== "/api/auth/verify-email" && pathname !== "/api/auth/session") return;

  authenticationGeneration += 1;
}

export function subscribeAuthenticationRequired(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(authenticationRequiredEventName, listener);
  return () => window.removeEventListener(authenticationRequiredEventName, listener);
}

function authenticationRequestPath(response: Response, requestPath?: string): string {
  const value = requestPath || response.url;
  if (!value) return "";
  try {
    return new URL(value, window.location.href).pathname;
  } catch {
    return value;
  }
}

async function confirmAuthenticationRequired(generation: number): Promise<void> {
  try {
    const response = await fetch("/api/auth/session", {
      cache: "no-store",
      credentials: "same-origin"
    });
    if (!response.ok) return;
    const session = await response.json() as unknown;
    if (generation !== authenticationGeneration || !isUnauthenticatedSession(session)) return;
    window.dispatchEvent(new Event(authenticationRequiredEventName));
  } catch {
    // A network error must never log out an otherwise valid browser session.
  }
}

function isAuthenticatedSession(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "authenticated" in value && value.authenticated === true);
}

function isUnauthenticatedSession(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "authenticated" in value && value.authenticated === false);
}
