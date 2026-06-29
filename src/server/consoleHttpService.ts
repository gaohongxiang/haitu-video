import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ZodError } from "zod";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

export function userFacingErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return "文本模型返回的商品资料格式不完整，请再点一次 AI 整理或补充商品资料后重试。";
  }
  return error instanceof Error ? error.message : String(error);
}

export function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`
    }
  });
}

export async function readConsoleIndex(consoleDistDir: string): Promise<string> {
  try {
    return await readFile(join(consoleDistDir, "index.html"), "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return readStatic("console.html");
    }
    throw error;
  }
}

async function readStatic(fileName: string): Promise<string> {
  return readFile(join(import.meta.dirname, "static", fileName), "utf8");
}

export async function staticResponse(fileName: string): Promise<Response> {
  const safeName = sanitizePathSegment(fileName);
  const content = await readFile(join(import.meta.dirname, "static", safeName));
  const type = safeName.endsWith(".css")
    ? "text/css; charset=utf-8"
    : safeName.endsWith(".js")
      ? "text/javascript; charset=utf-8"
      : safeName.endsWith(".svg")
        ? "image/svg+xml"
        : safeName.endsWith(".png")
          ? "image/png"
          : "text/plain; charset=utf-8";
  const body = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
  return new Response(body, {
    headers: { "content-type": type }
  });
}

export async function nodeRequestToFetch(request: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
  return new Request(`${requestOrigin(request)}${request.url ?? "/"}`, {
    method: request.method,
    headers: request.headers as HeadersInit,
    body
  });
}

export async function writeNodeResponse(response: ServerResponse, fetchResponse: Response): Promise<void> {
  response.writeHead(fetchResponse.status, Object.fromEntries(fetchResponse.headers.entries()));
  response.end(Buffer.from(await fetchResponse.arrayBuffer()));
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "run";
}

function requestOrigin(request: IncomingMessage): string {
  const forwardedProto = firstHeaderValue(request.headers["x-forwarded-proto"]);
  const proto = forwardedProto?.split(",")[0]?.trim() || (isEncryptedSocket(request.socket) ? "https" : "http");
  const forwardedHost = firstHeaderValue(request.headers["x-forwarded-host"]);
  const host = forwardedHost?.split(",")[0]?.trim() || request.headers.host || "localhost";
  return `${proto}://${host}`;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isEncryptedSocket(socket: IncomingMessage["socket"]): boolean {
  return "encrypted" in socket && socket.encrypted === true;
}
