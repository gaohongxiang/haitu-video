import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface ConsoleAuthSession {
  token: string;
  createdAt: string;
  expiresAt: string;
}

export interface ConsoleAuthStore {
  authEnabled(): boolean;
  sessionStatus(request: Request): Promise<ConsoleAuthSessionStatus>;
  requireAuth(request: Request): Promise<Response | undefined>;
  login(input: ConsoleAuthLoginInput): Promise<Response>;
  logout(request: Request): Promise<Response>;
}

export interface ConsoleAuthSessionStatus {
  authEnabled: boolean;
  authenticated: boolean;
}

export interface ConsoleAuthLoginInput {
  password?: string;
}

interface ConsoleAuthStoreOptions {
  password?: string;
  sessionFilePath: string;
  now?: () => Date;
}

const cookieName = "haitu_session";
const sessionTtlMs = 1000 * 60 * 60 * 24 * 7;

export class FileConsoleAuthStore implements ConsoleAuthStore {
  private readonly password: string;
  private readonly sessionFilePath: string;
  private readonly now: () => Date;

  constructor(options: ConsoleAuthStoreOptions) {
    this.password = options.password?.trim() ?? "";
    this.sessionFilePath = options.sessionFilePath;
    this.now = options.now ?? (() => new Date());
  }

  authEnabled(): boolean {
    return this.password.length > 0;
  }

  async sessionStatus(request: Request): Promise<ConsoleAuthSessionStatus> {
    return {
      authEnabled: this.authEnabled(),
      authenticated: !this.authEnabled() || await this.hasValidSession(request)
    };
  }

  async requireAuth(request: Request): Promise<Response | undefined> {
    if (!this.authEnabled() || await this.hasValidSession(request)) {
      return undefined;
    }
    return jsonResponse({ error: "Authentication required" }, 401);
  }

  async login(input: ConsoleAuthLoginInput): Promise<Response> {
    if (!this.authEnabled()) {
      return jsonResponse({
        authEnabled: false,
        authenticated: true
      });
    }
    if (!sameSecret(input.password ?? "", this.password)) {
      return jsonResponse({ error: "Invalid password" }, 401);
    }
    const session = this.createSession();
    await this.writeSession(session);
    return jsonResponse({
      authEnabled: true,
      authenticated: true
    }, 200, {
      "set-cookie": serializeSessionCookie(session.token, {
        maxAgeSeconds: Math.floor(sessionTtlMs / 1000)
      })
    });
  }

  async logout(request: Request): Promise<Response> {
    const token = readSessionCookie(request);
    if (token) {
      const current = await this.readSession();
      if (current?.token === token) {
        await this.writeSession(undefined);
      }
    }
    return jsonResponse({
      authEnabled: this.authEnabled(),
      authenticated: false
    }, 200, {
      "set-cookie": serializeSessionCookie("", {
        maxAgeSeconds: 0
      })
    });
  }

  private async hasValidSession(request: Request): Promise<boolean> {
    const token = readSessionCookie(request);
    if (!token) {
      return false;
    }
    const session = await this.readSession();
    if (!session || session.token !== token) {
      return false;
    }
    return new Date(session.expiresAt).getTime() > this.now().getTime();
  }

  private createSession(): ConsoleAuthSession {
    const now = this.now();
    return {
      token: randomBytes(32).toString("base64url"),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + sessionTtlMs).toISOString()
    };
  }

  private async readSession(): Promise<ConsoleAuthSession | undefined> {
    try {
      const parsed = JSON.parse(await readFile(this.sessionFilePath, "utf8")) as Partial<ConsoleAuthSession>;
      if (!parsed.token || !parsed.expiresAt || !parsed.createdAt) {
        return undefined;
      }
      return {
        token: parsed.token,
        createdAt: parsed.createdAt,
        expiresAt: parsed.expiresAt
      };
    } catch {
      return undefined;
    }
  }

  private async writeSession(session: ConsoleAuthSession | undefined): Promise<void> {
    await mkdir(dirname(this.sessionFilePath), { recursive: true });
    await writeFile(this.sessionFilePath, JSON.stringify(session ?? {}, null, 2), "utf8");
  }
}

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

function readSessionCookie(request: Request): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return undefined;
  }
  const cookies = cookieHeader.split(";").map((item) => item.trim());
  const prefix = `${cookieName}=`;
  const raw = cookies.find((item) => item.startsWith(prefix))?.slice(prefix.length);
  return raw ? decodeURIComponent(raw) : undefined;
}

function serializeSessionCookie(token: string, options: { maxAgeSeconds: number }): string {
  const encoded = encodeURIComponent(token);
  return [
    `${cookieName}=${encoded}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${options.maxAgeSeconds}`
  ].join("; ");
}

function sameSecret(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers
    }
  });
}
