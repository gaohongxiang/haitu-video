import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface AuditLogEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogInput {
  actor?: string;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogReadOptions {
  limit?: number;
}

export class FileAuditLog {
  constructor(private readonly filePath: string) {}

  async append(input: AuditLogInput): Promise<AuditLogEvent> {
    const event: AuditLogEvent = {
      id: randomUUID(),
      at: new Date().toISOString(),
      actor: input.actor ?? "admin",
      action: input.action,
      target: input.target,
      metadata: sanitizeMetadata(input.metadata)
    };
    await mkdir(dirname(this.filePath), { recursive: true });
    const existing = await this.readRaw();
    await writeFile(this.filePath, `${existing}${JSON.stringify(event)}\n`, "utf8");
    return event;
  }

  async list(options: AuditLogReadOptions = {}): Promise<{ summary: { totalEvents: number }; events: AuditLogEvent[] }> {
    const events = await this.readEvents();
    const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 50)));
    return {
      summary: {
        totalEvents: events.length
      },
      events: events.slice(-limit).reverse()
    };
  }

  private async readEvents(): Promise<AuditLogEvent[]> {
    const raw = await this.readRaw();
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as AuditLogEvent];
        } catch {
          return [];
        }
      });
  }

  private async readRaw(): Promise<string> {
    try {
      return await readFile(this.filePath, "utf8");
    } catch {
      return "";
    }
  }
}

function sanitizeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (/password|apiKey|secret|token/i.test(key)) {
      safe[key] = "[redacted]";
    } else {
      safe[key] = value;
    }
  }
  return safe;
}
