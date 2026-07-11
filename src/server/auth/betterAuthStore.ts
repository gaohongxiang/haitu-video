import { randomUUID } from "node:crypto";

import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";

import type {
  ConsoleAuthLoginInput,
  ConsoleAuthPasswordResetInput,
  ConsoleAuthPasswordResetRequestInput,
  ConsoleAuthSessionStatus,
  ConsoleAdminContext,
  ConsoleAuthStore,
  ConsoleAuthVerifyEmailInput,
  ConsoleWorkspaceContext
} from "../consoleAuth.js";
import { jsonResponse } from "../consoleAuth.js";
import { recordTrafficEvent } from "../adminTraffic.js";
import type { DatabaseHandle } from "../db/client.js";
import { sendAuthEmailOtp } from "./emailOtpSender.js";

interface AuthUserRow {
  id: string;
  email: string;
  email_verified: number;
}

interface WorkspaceRow {
  id: string;
  name: string;
  role: string;
}

interface PlatformUserRow {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
}

const minPasswordLength = 8;

interface MemoryRateLimitEntry {
  key: string;
  count: number;
  lastRequest: number;
}

export function createAtomicMemoryRateLimitStorage(now: () => number = Date.now) {
  const entries = new Map<string, MemoryRateLimitEntry>();

  return {
    get: async (key: string) => entries.get(key),
    set: async (key: string, value: MemoryRateLimitEntry) => {
      entries.set(key, value);
    },
    consume: async (key: string, rule: { window: number; max: number }) => {
      const requestedAt = now();
      const current = entries.get(key);
      const windowMilliseconds = rule.window * 1_000;

      if (!current || requestedAt - current.lastRequest >= windowMilliseconds) {
        entries.set(key, { key, count: 1, lastRequest: requestedAt });
        return { allowed: true, retryAfter: null };
      }

      if (current.count >= rule.max) {
        return {
          allowed: false,
          retryAfter: Math.max(1, Math.ceil((current.lastRequest + windowMilliseconds - requestedAt) / 1_000))
        };
      }

      entries.set(key, {
        ...current,
        count: current.count + 1
      });
      return { allowed: true, retryAfter: null };
    }
  };
}

export class BetterAuthConsoleAuthStore implements ConsoleAuthStore {
  private readonly auth: {
    handler(request: Request): Promise<Response>;
  };
  private readonly env: NodeJS.ProcessEnv;

  constructor(
    private readonly input: {
      handle: DatabaseHandle;
      dataDir: string;
      env?: NodeJS.ProcessEnv;
      now?: () => Date;
    }
  ) {
    this.env = input.env ?? process.env;
    this.auth = betterAuth({
      appName: "Haitu",
      database: input.handle.sqlite,
      secret: this.env.BETTER_AUTH_SECRET ?? this.env.HAITU_SECRET_KEY,
      baseURL: this.env.BETTER_AUTH_URL,
      basePath: "/api/auth",
      rateLimit: {
        enabled: true,
        storage: "memory",
        window: 60,
        max: 30,
        customStorage: createAtomicMemoryRateLimitStorage()
      },
      advanced: {
        cookiePrefix: "haitu-auth-v2",
        database: {
          generateId: "uuid"
        }
      },
      user: {
        modelName: "auth_users",
        fields: {
          emailVerified: "email_verified",
          createdAt: "created_at",
          updatedAt: "updated_at"
        }
      },
      session: {
        modelName: "auth_sessions",
        fields: {
          expiresAt: "expires_at",
          createdAt: "created_at",
          updatedAt: "updated_at",
          ipAddress: "ip_address",
          userAgent: "user_agent",
          userId: "user_id"
        },
        expiresIn: 60 * 60 * 24 * 7
      },
      account: {
        modelName: "auth_accounts",
        fields: {
          accountId: "account_id",
          providerId: "provider_id",
          userId: "user_id",
          accessToken: "access_token",
          refreshToken: "refresh_token",
          idToken: "id_token",
          accessTokenExpiresAt: "access_token_expires_at",
          refreshTokenExpiresAt: "refresh_token_expires_at",
          createdAt: "created_at",
          updatedAt: "updated_at"
        }
      },
      verification: {
        modelName: "auth_verifications",
        fields: {
          expiresAt: "expires_at",
          createdAt: "created_at",
          updatedAt: "updated_at"
        }
      },
      emailAndPassword: {
        enabled: true,
        minPasswordLength,
        requireEmailVerification: true,
        autoSignIn: false,
        revokeSessionsOnPasswordReset: true
      },
      emailVerification: {
        autoSignInAfterVerification: true,
        afterEmailVerification: async (user) => {
          this.ensureWorkspaceForVerifiedUser({
            id: user.id,
            email: user.email
          });
        }
      },
      plugins: [
        emailOTP({
          sendVerificationOnSignUp: true,
          overrideDefaultEmailVerification: true,
          storeOTP: "hashed",
          expiresIn: 60 * 5,
          async sendVerificationOTP(data) {
            await sendAuthEmailOtp({
              dataDir: input.dataDir,
              env: input.env ?? process.env,
              message: data
            });
          }
        })
      ]
    });
  }

  authEnabled(): boolean {
    return true;
  }

  async sessionStatus(request: Request): Promise<ConsoleAuthSessionStatus> {
    const session = await this.getBetterAuthSession(request);
    if (!session) {
      return {
        authEnabled: true,
        authenticated: false
      };
    }
    const workspace = this.findUserWorkspace(session.user.id);
    if (!workspace) {
      return {
        authEnabled: true,
        authenticated: false
      };
    }
    return this.sessionStatusFromContext({
      userId: session.user.id,
      email: session.user.email,
      workspace
    });
  }

  async requireAuth(request: Request): Promise<Response | undefined> {
    const session = await this.getBetterAuthSession(request);
    if (!session) {
      return jsonResponse({ error: "Authentication required" }, 401);
    }
    const workspace = this.findUserWorkspace(session.user.id);
    if (!workspace) {
      return jsonResponse({ error: "User has no workspace" }, 403);
    }
    return undefined;
  }

  async requireAdmin(request: Request): Promise<Response | undefined> {
    const session = await this.getBetterAuthSession(request);
    if (!session) {
      return jsonResponse({ error: "Authentication required" }, 401);
    }
    this.promoteConfiguredAdminEmail(session.user);
    const user = this.findPlatformUser(session.user.id);
    if (user?.role !== "admin") {
      return jsonResponse({ error: "Admin access required" }, 403);
    }
    return undefined;
  }

  async resolveCurrentWorkspace(request: Request): Promise<ConsoleWorkspaceContext> {
    const session = await this.getBetterAuthSession(request);
    if (!session) {
      throw new Error("Authentication required");
    }
    const workspace = this.findUserWorkspace(session.user.id);
    if (!workspace) {
      throw new Error("User has no workspace");
    }
    return {
      userId: session.user.id,
      workspaceId: workspace.id
    };
  }

  async resolveAdminUser(request: Request): Promise<ConsoleAdminContext> {
    const session = await this.getBetterAuthSession(request);
    if (!session) {
      throw new Error("Authentication required");
    }
    this.promoteConfiguredAdminEmail(session.user);
    const user = this.findPlatformUser(session.user.id);
    if (user?.role !== "admin") {
      throw new Error("Admin access required");
    }
    return {
      userId: user.id,
      email: user.email,
      role: "admin"
    };
  }

  async enter(input: ConsoleAuthLoginInput): Promise<Response> {
    const email = normalizeEmail(input.email);
    const password = normalizePassword(input.password);
    const existing = this.findAuthUserByEmail(email);
    if (!existing) {
      const response = await this.callBetterAuth("/sign-up/email", {
        method: "POST",
        body: {
          email,
          password,
          name: email,
          rememberMe: true
        }
      });
      if (!response.ok) {
        return await this.authErrorResponse(response);
      }
      return jsonResponse({
        authEnabled: true,
        authenticated: false,
        verificationRequired: true,
        email
      }, 202);
    }
    if (!existing.email_verified) {
      await this.resendVerificationOtp(email);
      return jsonResponse({
        authEnabled: true,
        authenticated: false,
        verificationRequired: true,
        email
      }, 202);
    }
    const response = await this.callBetterAuth("/sign-in/email", {
      method: "POST",
      body: {
        email,
        password,
        rememberMe: true
      }
    });
    if (!response.ok) {
      return await this.authErrorResponse(response);
    }
    const sessionResponse = await this.sessionResponseFromAuthResponse(response);
    this.safeRecordTrafficEvent({
      eventName: "auth_login",
      path: "/api/auth/enter",
      userId: existing.id
    });
    return sessionResponse;
  }

  async verifyEmail(input: ConsoleAuthVerifyEmailInput): Promise<Response> {
    const email = normalizeEmail(input.email);
    const otp = normalizeOtp(input.otp);
    const response = await this.callBetterAuth("/email-otp/verify-email", {
      method: "POST",
      body: {
        email,
        otp
      }
    });
    if (!response.ok) {
      return await this.authErrorResponse(response);
    }
    const sessionResponse = await this.sessionResponseFromAuthResponse(response);
    const verified = this.findAuthUserByEmail(email);
    if (verified) {
      this.safeRecordTrafficEvent({
        eventName: "auth_signup",
        path: "/",
        userId: verified.id
      });
    }
    return sessionResponse;
  }

  async requestPasswordReset(input: ConsoleAuthPasswordResetRequestInput): Promise<Response> {
    const email = normalizeEmail(input.email);
    const response = await this.callBetterAuth("/email-otp/request-password-reset", {
      method: "POST",
      body: {
        email
      }
    });
    if (!response.ok) {
      return await this.authErrorResponse(response);
    }
    return jsonResponse({ success: true });
  }

  async resetPassword(input: ConsoleAuthPasswordResetInput): Promise<Response> {
    const email = normalizeEmail(input.email);
    const otp = normalizeOtp(input.otp);
    const password = normalizePassword(input.password);
    const response = await this.callBetterAuth("/email-otp/reset-password", {
      method: "POST",
      body: {
        email,
        otp,
        password
      }
    });
    if (!response.ok) {
      return await this.authErrorResponse(response);
    }
    return jsonResponse({ success: true });
  }

  async logout(request: Request): Promise<Response> {
    const response = await this.auth.handler(new Request(new URL("/api/auth/sign-out", request.url), {
      method: "POST",
      headers: request.headers
    }));
    return jsonResponse({
      authEnabled: true,
      authenticated: false
    }, 200, copySetCookieHeaders(response.headers));
  }

  private async resendVerificationOtp(email: string): Promise<void> {
    await this.callBetterAuth("/email-otp/send-verification-otp", {
      method: "POST",
      body: {
        email,
        type: "email-verification"
      }
    });
  }

  private async sessionResponseFromAuthResponse(response: Response): Promise<Response> {
    const cookie = cookieRequestHeaderFromSetCookie(response.headers);
    const session = await this.sessionStatus(new Request("http://localhost/api/auth/session", {
      headers: cookie ? { cookie } : {}
    }));
    return jsonResponse(session, 200, copySetCookieHeaders(response.headers));
  }

  private safeRecordTrafficEvent(input: {
    eventName: "auth_signup" | "auth_login";
    path: string;
    userId: string;
  }): void {
    try {
      const workspace = this.findUserWorkspace(input.userId);
      recordTrafficEvent({
        handle: this.input.handle,
        eventName: input.eventName,
        path: input.path,
        userId: input.userId,
        workspaceId: workspace?.id,
        occurredAt: this.input.now?.() ?? new Date()
      });
    } catch {
      // Analytics must not block authentication.
    }
  }

  private async getBetterAuthSession(request: Request): Promise<{
    user: {
      id: string;
      email: string;
      name?: string;
    };
  } | undefined> {
    const response = await this.auth.handler(new Request(new URL("/api/auth/get-session", request.url), {
      method: "GET",
      headers: request.headers
    }));
    if (!response.ok) {
      return undefined;
    }
    const body = await response.json() as { user?: { id: string; email: string; name?: string } } | null;
    return body?.user ? { user: body.user } : undefined;
  }

  private async callBetterAuth(path: string, input: {
    method: "POST";
    body: unknown;
  }): Promise<Response> {
    return await this.auth.handler(new Request(`http://localhost/api/auth${path}`, {
      method: input.method,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(input.body)
    }));
  }

  private async authErrorResponse(response: Response): Promise<Response> {
    const body = await safeJson(response);
    const message =
      (typeof body?.error === "string" ? body.error : undefined) ??
      (typeof body?.message === "string" ? body.message : undefined) ??
      `HTTP ${response.status}`;
    if (message === "EMAIL_NOT_VERIFIED" || message.includes("Email not verified")) {
      return jsonResponse({ error: "请先验证邮箱。", verificationRequired: true }, 403);
    }
    return jsonResponse({ error: friendlyAuthError(message) }, response.status);
  }

  private findAuthUserByEmail(email: string): AuthUserRow | undefined {
    return this.input.handle.sqlite.prepare(`
      SELECT id, email, email_verified
      FROM auth_users
      WHERE lower(email) = lower(?)
    `).get(email) as AuthUserRow | undefined;
  }

  private findPlatformUser(userId: string): PlatformUserRow | undefined {
    return this.input.handle.sqlite.prepare(`
      SELECT id, email, display_name, role
      FROM users
      WHERE id = ?
    `).get(userId) as PlatformUserRow | undefined;
  }

  private promoteConfiguredAdminEmail(user: { id: string; email: string }): void {
    if (!this.isConfiguredAdminEmail(user.email)) {
      return;
    }
    const now = this.now().toISOString();
    this.input.handle.sqlite.prepare(`
      UPDATE users
      SET role = 'admin', updated_at = @now
      WHERE id = @id AND role <> 'admin'
    `).run({
      id: user.id,
      now
    });
  }

  private ensureWorkspaceForVerifiedUser(user: { id: string; email: string }): void {
    const now = this.now().toISOString();
    const ensure = this.input.handle.sqlite.transaction(() => {
      const workspaceId = this.nextWorkspaceId(user.id);
      this.input.handle.sqlite.prepare(`
        INSERT INTO users (id, email, password_hash, display_name, role, created_at, updated_at)
        VALUES (@id, @email, NULL, @displayName, @role, @now, @now)
        ON CONFLICT(id) DO UPDATE SET
          email = excluded.email,
          display_name = excluded.display_name,
          role = CASE
            WHEN excluded.role = 'admin' THEN 'admin'
            ELSE users.role
          END,
          updated_at = excluded.updated_at
      `).run({
        id: user.id,
        email: user.email,
        displayName: user.email,
        role: this.isConfiguredAdminEmail(user.email) ? "admin" : "user",
        now
      });
      this.input.handle.sqlite.prepare(`
        INSERT INTO workspaces (id, name, owner_user_id, created_at, updated_at)
        VALUES (@id, @name, @ownerUserId, @now, @now)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          owner_user_id = excluded.owner_user_id,
          updated_at = excluded.updated_at
      `).run({
        id: workspaceId,
        name: `${user.email} 的工作区`,
        ownerUserId: user.id,
        now
      });
      this.input.handle.sqlite.prepare(`
        INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
        VALUES (@workspaceId, @userId, 'owner', @now)
        ON CONFLICT(workspace_id, user_id) DO NOTHING
      `).run({
        workspaceId,
        userId: user.id,
        now
      });
    });
    ensure();
  }

  private nextWorkspaceId(userId: string): string {
    const existing = this.findUserWorkspace(userId);
    if (existing) {
      return existing.id;
    }
    const verifiedUserCount = this.input.handle.sqlite
      .prepare("SELECT COUNT(*) AS count FROM users")
      .get() as { count: number };
    if (verifiedUserCount.count === 0 && this.workspaceHasNoOwner("default")) {
      return "default";
    }
    return randomUUID();
  }

  private workspaceHasNoOwner(workspaceId: string): boolean {
    const workspace = this.input.handle.sqlite
      .prepare("SELECT owner_user_id FROM workspaces WHERE id = ?")
      .get(workspaceId) as { owner_user_id: string | null } | undefined;
    return Boolean(workspace && !workspace.owner_user_id);
  }

  private findUserWorkspace(userId: string): WorkspaceRow | undefined {
    return this.input.handle.sqlite.prepare(`
      SELECT w.id, w.name, wm.role
      FROM workspaces w
      INNER JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = ?
      ORDER BY
        CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
        w.created_at ASC
      LIMIT 1
    `).get(userId) as WorkspaceRow | undefined;
  }

  private sessionStatusFromContext(context: {
    userId: string;
    email: string;
    workspace: WorkspaceRow;
  }): ConsoleAuthSessionStatus {
    return {
      authEnabled: true,
      authenticated: true,
      user: {
        id: context.userId,
        email: context.email,
        displayName: context.email,
        role: "user"
      },
      workspace: {
        id: context.workspace.id,
        name: context.workspace.name,
        role: context.workspace.role
      }
    };
  }

  private now(): Date {
    return (this.input.now ?? (() => new Date()))();
  }

  private isConfiguredAdminEmail(email: string): boolean {
    const configured = this.env.HAITU_ADMIN_EMAIL?.trim().toLowerCase();
    return Boolean(configured && email.trim().toLowerCase() === configured);
  }
}

function normalizeEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Valid email is required.");
  }
  return email;
}

function normalizePassword(value: unknown): string {
  const password = typeof value === "string" ? value : "";
  if (password.length < minPasswordLength) {
    throw new Error(`Password must be at least ${minPasswordLength} characters.`);
  }
  return password;
}

function normalizeOtp(value: unknown): string {
  const otp = typeof value === "string" ? value.trim() : "";
  if (!/^\d{6}$/.test(otp)) {
    throw new Error("Valid verification code is required.");
  }
  return otp;
}

function copySetCookieHeaders(headers: Headers): HeadersInit {
  const result = new Headers();
  for (const setCookie of setCookieHeaderValues(headers)) {
    result.append("set-cookie", setCookie);
  }
  return result;
}

function cookieRequestHeaderFromSetCookie(headers: Headers): string {
  return setCookieHeaderValues(headers)
    .map((setCookie) => setCookie.split(";", 1)[0] ?? "")
    .filter(Boolean)
    .join("; ");
}

function setCookieHeaderValues(headers: Headers): string[] {
  const values = headers.getSetCookie();
  const candidates = values.length > 0 ? values : [headers.get("set-cookie") ?? ""];
  return candidates.flatMap(splitCombinedSetCookieHeader).filter(Boolean);
}

function splitCombinedSetCookieHeader(value: string): string[] {
  const result: string[] = [];
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== ",") continue;
    let cursor = index + 1;
    while (value[cursor] === " ") cursor += 1;
    while (cursor < value.length && !["=", ";", ","].includes(value[cursor] ?? "")) cursor += 1;
    if (value[cursor] !== "=") continue;
    const cookie = value.slice(start, index).trim();
    if (cookie) result.push(cookie);
    start = index + 1;
  }
  const finalCookie = value.slice(start).trim();
  if (finalCookie) result.push(finalCookie);
  return result;
}

async function safeJson(response: Response): Promise<Record<string, unknown> | undefined> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function friendlyAuthError(message: string): string {
  if (message.includes("INVALID_EMAIL_OR_PASSWORD")) {
    return "邮箱或密码不正确。";
  }
  if (message.includes("PASSWORD_TOO_SHORT")) {
    return `密码至少需要 ${minPasswordLength} 位。`;
  }
  if (message.includes("INVALID_OTP") || message.includes("OTP_EXPIRED") || message.includes("TOO_MANY_ATTEMPTS")) {
    return "验证码无效或已过期，请重新获取。";
  }
  return message;
}
