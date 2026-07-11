import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ZodError } from "zod";

const maxRequestBodyBytes = 30 * 1024 * 1024;

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
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxRequestBodyBytes) {
    throw new RequestBodyTooLargeError();
  }
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxRequestBodyBytes) {
      throw new RequestBodyTooLargeError();
    }
    chunks.push(buffer);
  }
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
  return new Request(`${requestOrigin(request)}${request.url ?? "/"}`, {
    method: request.method,
    headers: request.headers as HeadersInit,
    body
  });
}

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the 30 MB limit.");
  }
}

export async function writeNodeResponse(response: ServerResponse, fetchResponse: Response): Promise<void> {
  response.writeHead(fetchResponse.status, nodeResponseHeaders(fetchResponse.headers));
  if (!fetchResponse.body) {
    response.end();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const body = Readable.fromWeb(fetchResponse.body as import("node:stream/web").ReadableStream);
    body.once("error", reject);
    response.once("error", reject);
    response.once("finish", resolve);
    body.pipe(response);
  });
}

export function nodeResponseHeaders(headers: Headers): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const [name, value] of headers.entries()) {
    if (name !== "set-cookie") {
      result[name] = value;
    }
  }
  const setCookies = headers.getSetCookie();
  if (setCookies.length > 0) {
    result["set-cookie"] = setCookies;
  }
  return result;
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
