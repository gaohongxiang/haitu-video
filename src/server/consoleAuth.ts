export interface ConsoleAuthStore {
  authEnabled(): boolean;
  sessionStatus(request: Request): Promise<ConsoleAuthSessionStatus>;
  requireAuth(request: Request): Promise<Response | undefined>;
  resolveCurrentWorkspace(request: Request): Promise<ConsoleWorkspaceContext>;
  enter(input: ConsoleAuthLoginInput): Promise<Response>;
  logout(request: Request): Promise<Response>;
}

export interface ConsoleAuthSessionStatus {
  authEnabled: boolean;
  authenticated: boolean;
  user?: {
    id: string;
    email?: string;
    displayName?: string;
    role?: string;
  };
  workspace?: {
    id: string;
    name?: string;
    role?: string;
  };
}

export interface ConsoleWorkspaceContext {
  userId: string;
  workspaceId: string;
}

export interface ConsoleAuthLoginInput {
  email?: string;
  password?: string;
}

const cookieName = "haitu_session";

export function isPublicConsoleRoute(request: Request): boolean {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/health") {
    return true;
  }
  if (url.pathname.startsWith("/api/auth/")) {
    return true;
  }
  if ((request.method === "GET" || request.method === "HEAD") && (url.pathname === "/" || url.pathname === "/console")) {
    return true;
  }
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/assets/")) {
    return true;
  }
  if (request.method === "GET" && url.pathname.startsWith("/static/")) {
    return true;
  }
  return false;
}

export function readSessionCookie(request: Request): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return undefined;
  }
  const cookies = cookieHeader.split(";").map((item) => item.trim());
  const prefix = `${cookieName}=`;
  const raw = cookies.find((item) => item.startsWith(prefix))?.slice(prefix.length);
  return raw ? decodeURIComponent(raw) : undefined;
}

export function serializeSessionCookie(token: string, options: { maxAgeSeconds: number }): string {
  const encoded = encodeURIComponent(token);
  return [
    `${cookieName}=${encoded}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${options.maxAgeSeconds}`
  ].join("; ");
}

export function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers
    }
  });
}
