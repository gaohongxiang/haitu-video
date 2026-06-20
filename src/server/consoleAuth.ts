export interface ConsoleAuthStore {
  authEnabled(): boolean;
  sessionStatus(request: Request): Promise<ConsoleAuthSessionStatus>;
  requireAuth(request: Request): Promise<Response | undefined>;
  requireAdmin(request: Request): Promise<Response | undefined>;
  resolveCurrentWorkspace(request: Request): Promise<ConsoleWorkspaceContext>;
  resolveAdminUser(request: Request): Promise<ConsoleAdminContext>;
  enter(input: ConsoleAuthLoginInput): Promise<Response>;
  verifyEmail(input: ConsoleAuthVerifyEmailInput): Promise<Response>;
  requestPasswordReset(input: ConsoleAuthPasswordResetRequestInput): Promise<Response>;
  resetPassword(input: ConsoleAuthPasswordResetInput): Promise<Response>;
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

export interface ConsoleAdminContext {
  userId: string;
  email: string;
  role: "admin";
}

export interface ConsoleAuthLoginInput {
  email?: string;
  password?: string;
}

export interface ConsoleAuthVerifyEmailInput {
  email?: string;
  otp?: string;
}

export interface ConsoleAuthPasswordResetRequestInput {
  email?: string;
}

export interface ConsoleAuthPasswordResetInput {
  email?: string;
  otp?: string;
  password?: string;
}

export function isPublicConsoleRoute(request: Request): boolean {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/health") {
    return true;
  }
  if (url.pathname.startsWith("/api/auth/")) {
    return true;
  }
  if ((request.method === "GET" || request.method === "HEAD") && (url.pathname === "/" || url.pathname === "/console" || url.pathname === "/admin")) {
    return true;
  }
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/favicon.svg") {
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

export function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers
    }
  });
}
