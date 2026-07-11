export const authenticationRequiredEventName = "haitu:authentication-required";

export function notifyAuthenticationRequired(response: Response, requestPath?: string): void {
  if (response.status !== 401 || typeof window === "undefined") return;

  const pathname = authenticationRequestPath(response, requestPath);
  if (pathname.startsWith("/api/auth/")) return;

  window.dispatchEvent(new Event(authenticationRequiredEventName));
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
