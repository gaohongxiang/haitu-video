import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const maxRemoteImageBytes = 20 * 1024 * 1024;
const remoteImageTimeoutMs = 10_000;
const maxRedirects = 3;

export interface RemoteImageResult {
  bytes: Buffer;
  contentType: string;
  finalUrl: string;
}

export async function fetchRemoteImage(input: {
  url: string;
  fetchImpl?: typeof fetch;
}): Promise<RemoteImageResult> {
  const fetcher = input.fetchImpl ?? fetch;
  let currentUrl = input.url;
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const parsed = await assertSafeRemoteUrl(currentUrl, input.fetchImpl === undefined);
    const response = await fetcher(parsed, {
      redirect: "manual",
      signal: AbortSignal.timeout(remoteImageTimeoutMs)
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === maxRedirects) {
        throw new Error("参考图地址重定向次数过多。");
      }
      currentUrl = new URL(location, parsed).toString();
      continue;
    }
    if (!response.ok) {
      throw new Error("参考图地址无法访问。");
    }
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > maxRemoteImageBytes) {
      throw new Error("远程参考图不能超过 20 MB。");
    }
    const bytes = await readLimitedBody(response, maxRemoteImageBytes);
    return {
      bytes,
      contentType: response.headers.get("content-type") ?? "",
      finalUrl: parsed.toString()
    };
  }
  throw new Error("参考图地址重定向次数过多。");
}

async function assertSafeRemoteUrl(value: string, resolveHostname: boolean): Promise<URL> {
  const url = new URL(value);
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new Error("参考图地址必须是公开的 HTTP 或 HTTPS 地址。");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("参考图地址不能指向本机或内网。");
  }
  if (isIP(hostname)) {
    assertPublicIp(hostname);
  } else if (resolveHostname) {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (addresses.length === 0) {
      throw new Error("参考图域名无法解析。");
    }
    addresses.forEach((address) => assertPublicIp(address.address));
  }
  return url;
}

function assertPublicIp(address: string): void {
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    assertPublicIp(normalized.slice("::ffff:".length));
    return;
  }
  if (isPrivateIpv4(normalized) || isPrivateIpv6(normalized)) {
    throw new Error("参考图地址不能指向本机或内网。");
  }
}

function isPrivateIpv4(address: string): boolean {
  if (isIP(address) !== 4) {
    return false;
  }
  const [a = 0, b = 0, c = 0] = address.split(".").map(Number);
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 198 && (b === 18 || b === 19 || b === 51))
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

function isPrivateIpv6(address: string): boolean {
  if (isIP(address) !== 6) {
    return false;
  }
  return address === "::" || address === "::1" || address.startsWith("fc") || address.startsWith("fd") || /^fe[89ab]/.test(address);
}

async function readLimitedBody(response: Response, limit: number): Promise<Buffer> {
  if (!response.body) {
    return Buffer.alloc(0);
  }
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    const chunk = Buffer.from(value);
    total += chunk.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error("远程参考图不能超过 20 MB。");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}
