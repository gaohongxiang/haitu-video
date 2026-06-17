import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

import type {
  ConsoleAuthLoginInput,
  ConsoleAuthSessionStatus,
  ConsoleAuthStore,
  ConsoleWorkspaceContext
} from "../consoleAuth.js";
import {
  jsonResponse,
  readSessionCookie,
  serializeSessionCookie
} from "../consoleAuth.js";
import type { DatabaseHandle } from "../db/client.js";

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  display_name: string | null;
  role: string;
}

interface SessionContextRow extends UserRow {
  workspace_id: string;
  workspace_name: string;
  workspace_role: string;
  expires_at: string;
}

const sessionTtlMs = 1000 * 60 * 60 * 24 * 7;

export class SqliteConsoleAuthStore implements ConsoleAuthStore {
  constructor(
    private readonly input: {
      handle: DatabaseHandle;
      now?: () => Date;
    }
  ) {}

  authEnabled(): boolean {
    return true;
  }

  async sessionStatus(request: Request): Promise<ConsoleAuthSessionStatus> {
    const context = this.readSessionContext(request);
    if (!context) {
      return {
        authEnabled: true,
        authenticated: false
      };
    }
    return this.sessionStatusFromContext(context);
  }

  async requireAuth(request: Request): Promise<Response | undefined> {
    if (this.readSessionContext(request)) {
      return undefined;
    }
    return jsonResponse({ error: "Authentication required" }, 401);
  }

  async resolveCurrentWorkspace(request: Request): Promise<ConsoleWorkspaceContext> {
    const context = this.readSessionContext(request);
    if (!context) {
      throw new Error("Authentication required");
    }
    return {
      userId: context.id,
      workspaceId: context.workspace_id
    };
  }

  async enter(input: ConsoleAuthLoginInput): Promise<Response> {
    const email = normalizeEmail(input.email);
    const existing = this.findUserByEmail(email);
    if (existing) {
      return this.login(input);
    }
    return this.registerUser(input);
  }

  private registerUser(input: ConsoleAuthLoginInput): Response {
    const email = normalizeEmail(input.email);
    const password = normalizePassword(input.password);
    const now = this.now();
    const userId = randomUUID();
    const workspaceId = this.nextWorkspaceId();
    const displayName = email;
    const passwordHash = hashPassword(password);
    const createUser = this.input.handle.sqlite.transaction(() => {
      this.input.handle.sqlite.prepare(`
        INSERT INTO users (id, email, password_hash, display_name, role, created_at, updated_at)
        VALUES (@id, @email, @passwordHash, @displayName, 'user', @now, @now)
      `).run({
        id: userId,
        email,
        passwordHash,
        displayName,
        now: now.toISOString()
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
        name: `${email} 的工作区`,
        ownerUserId: userId,
        now: now.toISOString()
      });
      this.input.handle.sqlite.prepare(`
        INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
        VALUES (@workspaceId, @userId, 'owner', @now)
      `).run({
        workspaceId,
        userId,
        now: now.toISOString()
      });
    });
    try {
      createUser();
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return jsonResponse({ error: "Email already registered" }, 409);
      }
      throw error;
    }
    return this.createSessionResponse(userId, workspaceId);
  }

  private login(input: ConsoleAuthLoginInput): Response {
    const email = normalizeEmail(input.email);
    const password = normalizePassword(input.password);
    const user = this.findUserByEmail(email);
    if (!user?.password_hash || !verifyPassword(password, user.password_hash)) {
      return jsonResponse({ error: "Invalid email or password" }, 401);
    }
    const workspace = this.input.handle.sqlite.prepare(`
      SELECT w.id
      FROM workspaces w
      INNER JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = ?
      ORDER BY
        CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
        w.created_at ASC
      LIMIT 1
    `).get(user.id) as { id: string } | undefined;
    if (!workspace) {
      return jsonResponse({ error: "User has no workspace" }, 403);
    }
    return this.createSessionResponse(user.id, workspace.id);
  }

  async logout(request: Request): Promise<Response> {
    const token = readSessionCookie(request);
    if (token) {
      this.input.handle.sqlite.prepare("DELETE FROM user_sessions WHERE token_hash = ?").run(hashToken(token));
    }
    return jsonResponse({
      authEnabled: true,
      authenticated: false
    }, 200, {
      "set-cookie": serializeSessionCookie("", {
        maxAgeSeconds: 0
      })
    });
  }

  private findUserByEmail(email: string): UserRow | undefined {
    return this.input.handle.sqlite.prepare(`
      SELECT id, email, password_hash, display_name, role
      FROM users
      WHERE lower(email) = lower(?)
    `).get(email) as UserRow | undefined;
  }

  private nextWorkspaceId(): string {
    const userCount = this.input.handle.sqlite
      .prepare("SELECT COUNT(*) AS count FROM users")
      .get() as { count: number };
    if (userCount.count === 0 && this.workspaceHasNoOwner("default")) {
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

  private createSessionResponse(userId: string, workspaceId: string): Response {
    const now = this.now();
    const expiresAt = new Date(now.getTime() + sessionTtlMs);
    const token = randomBytes(32).toString("base64url");
    this.input.handle.sqlite.prepare(`
      INSERT INTO user_sessions (token_hash, user_id, workspace_id, created_at, expires_at)
      VALUES (@tokenHash, @userId, @workspaceId, @createdAt, @expiresAt)
    `).run({
      tokenHash: hashToken(token),
      userId,
      workspaceId,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    });
    const context = this.readSessionContextByHash(hashToken(token));
    return jsonResponse(this.sessionStatusFromContext(context), 200, {
      "set-cookie": serializeSessionCookie(token, {
        maxAgeSeconds: Math.floor(sessionTtlMs / 1000)
      })
    });
  }

  private readSessionContext(request: Request): SessionContextRow | undefined {
    const token = readSessionCookie(request);
    if (!token) {
      return undefined;
    }
    try {
      return this.readSessionContextByHash(hashToken(token));
    } catch {
      return undefined;
    }
  }

  private readSessionContextByHash(tokenHash: string): SessionContextRow {
    const now = this.now().toISOString();
    this.input.handle.sqlite.prepare("DELETE FROM user_sessions WHERE expires_at <= ?").run(now);
    const context = this.input.handle.sqlite.prepare(`
      SELECT
        u.id,
        u.email,
        u.password_hash,
        u.display_name,
        u.role,
        w.id AS workspace_id,
        w.name AS workspace_name,
        wm.role AS workspace_role,
        s.expires_at
      FROM user_sessions s
      INNER JOIN users u ON u.id = s.user_id
      INNER JOIN workspaces w ON w.id = s.workspace_id
      INNER JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = u.id
      WHERE s.token_hash = ? AND s.expires_at > ?
    `).get(tokenHash, now) as SessionContextRow | undefined;
    if (!context) {
      throw new Error("Authentication required");
    }
    return context;
  }

  private sessionStatusFromContext(context: SessionContextRow): ConsoleAuthSessionStatus {
    return {
      authEnabled: true,
      authenticated: true,
      user: {
        id: context.id,
        email: context.email,
        displayName: context.display_name ?? undefined,
        role: context.role
      },
      workspace: {
        id: context.workspace_id,
        name: context.workspace_name,
        role: context.workspace_role
      }
    };
  }

  private now(): Date {
    return (this.input.now ?? (() => new Date()))();
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
  if (password.length < 12) {
    throw new Error("Password must be at least 12 characters.");
  }
  return password;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 64).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [, salt, hash] = storedHash.split("$");
  if (!salt || !hash) {
    return false;
  }
  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}
