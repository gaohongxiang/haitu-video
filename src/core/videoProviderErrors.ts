export interface ReadableVideoProviderErrorInput {
  message?: string;
  rawMessage?: string;
  causeMessage?: string;
  causeCode?: string;
  providerPhase?: string;
  providerName?: string;
  providerModel?: string;
  referenceImageCount?: number;
}

export const maxSeedanceReferenceImages = 9;

export function readableVideoProviderError(input: ReadableVideoProviderErrorInput | string | undefined): string {
  const details = typeof input === "string" ? { message: input } : input;
  const message = details?.message ?? "";
  if (!message) {
    return "";
  }
  const diagnosticMessage = shouldUseRawProviderMessage(message) && details?.rawMessage ? details.rawMessage : message;

  if (isTooManySeedanceReferenceImages(diagnosticMessage)) {
    const count = seedanceReferenceImageCount(diagnosticMessage) ?? details?.referenceImageCount;
    return count && count > maxSeedanceReferenceImages
      ? `参考图太多：Seedance 最多支持 ${maxSeedanceReferenceImages} 张，本次有 ${count} 张。生成时只使用前 ${maxSeedanceReferenceImages} 张，请调整顺序或删除多余图片后重试。`
      : `参考图太多：Seedance 最多支持 ${maxSeedanceReferenceImages} 张。生成时只使用前 ${maxSeedanceReferenceImages} 张，请调整顺序或删除多余图片后重试。`;
  }

  if (
    diagnosticMessage.includes("InputImageSensitiveContentDetected.PrivacyInformation") ||
    diagnosticMessage.includes("input image may contain real person")
  ) {
    return "参考图里可能包含真人、人脸或隐私信息，视频平台已拒绝生成。请移除含人物或人脸的参考图，保留纯商品图后重试。";
  }

  if (isSeedanceReferenceImageDownloadFailure(diagnosticMessage)) {
    const referenceIndex = seedanceReferenceImageIndex(diagnosticMessage);
    const target = referenceIndex ? `第 ${referenceIndex} 张参考图` : "某张参考图";
    return userFacingReason(
      `${target}现在不能用于生成。请重新上传这张图，或删除后换一张图片再生成`
    );
  }

  if (diagnosticMessage.includes("API 管理配置视频模型 API Key")) {
    return "还没有配置视频模型 API Key。请先到 API 管理里配置或选择视频模型服务，再生成视频。";
  }

  if (isSeedanceOutputDownloadFailure(diagnosticMessage, details)) {
    return "视频已经生成，但服务器下载成片超时。请点击重新下载成片；如果连续失败，可能是服务器到视频文件服务器的网络不稳定。";
  }

  if (diagnosticMessage.includes("fetch failed") || diagnosticMessage.includes("Headers Timeout Error")) {
    return "视频平台请求超时或网络连接失败，请稍后重试；如果连续失败，请检查视频模型配置和参考图链接。";
  }

  if (diagnosticMessage.includes("rate limit") || diagnosticMessage.includes("Too Many Requests") || diagnosticMessage.includes("429")) {
    return "视频平台请求太频繁或触发限流，请稍后再试。";
  }

  if (diagnosticMessage.includes("quota") || diagnosticMessage.includes("insufficient") || diagnosticMessage.includes("balance")) {
    return "视频平台账号额度不足或余额异常，请检查火山/Seedance 账号额度后再试。";
  }

  if (diagnosticMessage.includes("Volcengine Seedance API error") || diagnosticMessage.includes("Volcengine Seedance task")) {
    return seedanceProviderDiagnosticMessage(diagnosticMessage);
  }

  return message;
}

function shouldUseRawProviderMessage(message: string): boolean {
  return message === "视频平台拒绝了这次生成请求。请检查参考图、商品资料和视频模型配置后重试。" ||
    message === "视频平台拒绝了这次生成请求。请检查商品资料、参考图和视频模型配置后重试。";
}

function seedanceProviderDiagnosticMessage(message: string): string {
  const providerError = extractSeedanceProviderError(message);
  if (!providerError) {
    return userFacingReason("视频平台拒绝了这次生成请求。");
  }
  const translated = seedanceProviderMessage(providerError);
  if (translated) {
    return translated;
  }
  return seedanceProviderFallbackMessage(providerError);
}

interface SeedanceProviderError {
  code?: string;
  message?: string;
  param?: string;
  type?: string;
}

function seedanceProviderMessage(providerError: SeedanceProviderError): string | undefined {
  const message = providerError.message ?? "";
  if (providerError.code === "ModelNotOpen") {
    const model = seedanceModelName(message);
    return userFacingReason(
      model
        ? `视频模型未开通：当前火山账号还没有开通 ${model}。请在火山方舟控制台开通该模型，或切换到已开通的视频模型后重试`
        : "视频模型未开通：当前火山账号还没有开通所选视频模型。请在火山方舟控制台开通该模型，或切换到已开通的视频模型后重试"
    );
  }
  if (isSeedanceReferenceImageDownloadFailure(message)) {
    const referenceIndex = seedanceReferenceImageIndex(message);
    const target = referenceIndex ? `第 ${referenceIndex} 张参考图` : "某张参考图";
    return userFacingReason(`${target}现在不能用于生成。请重新上传这张图，或删除后换一张图片再生成`);
  }
  if (providerError.code === "InvalidParameter" && message.toLowerCase().includes("prompt") && message.toLowerCase().includes("too long")) {
    return userFacingReason("提示词太长，视频平台拒绝了这次生成。请缩短商品描述、卖点或分镜内容后重试");
  }
  if (isAccountBillingError(providerError)) {
    return "视频平台账号欠费或余额异常，请检查火山/Seedance 账号账单和余额后重试。";
  }
  if (providerError.code === "ProviderInternalRule") {
    return userFacingReason("视频平台根据内部规则拒绝了这次生成。优先处理参考图：删除真人、人脸、二维码、联系方式、品牌授权不明或过度暴露的图片；再缩短卖点和分镜，避免夸大功效、绝对化表述和敏感词后重试");
  }
  return undefined;
}

function seedanceProviderFallbackMessage(providerError: SeedanceProviderError): string {
  const code = providerError.code ?? providerError.type;
  const cleanMessage = cleanProviderMessage(providerError.message);
  const headline = code ? `视频平台返回 ${code}` : "视频平台拒绝了这次生成请求";
  const details = [
    cleanMessage ? `${headline}：${cleanMessage}` : headline,
    providerError.param ? `参数：${providerError.param}` : ""
  ].filter(Boolean);
  return userFacingReason(details.join("。"));
}

function cleanProviderMessage(message: string | undefined): string {
  return (message ?? "")
    .replace(/\s*Request id:\s*[a-z0-9-]+/gi, "")
    .replace(/\s*request id\s*[:：]\s*[a-z0-9-]+/gi, "")
    .trim()
    .replace(/[.。]+$/, "");
}

function isAccountBillingError(providerError: SeedanceProviderError): boolean {
  const diagnostic = `${providerError.code ?? ""} ${providerError.message ?? ""}`.toLowerCase();
  return diagnostic.includes("overdue") ||
    diagnostic.includes("arrears") ||
    diagnostic.includes("balance") ||
    diagnostic.includes("quota") ||
    diagnostic.includes("insufficient") ||
    diagnostic.includes("accountoverdue") ||
    diagnostic.includes("insufficientbalance");
}

function seedanceModelName(message: string): string | undefined {
  const match = message.match(/\b(doubao-seedance-[a-z0-9-]+)\b/i);
  return match?.[1];
}

function userFacingReason(reason: string): string {
  return reason.endsWith("。") || reason.endsWith(".") ? reason : `${reason}。`;
}

function extractSeedanceProviderError(message: string): SeedanceProviderError | undefined {
  const jsonText = message.match(/\{.*\}/s)?.[0];
  if (!jsonText) {
    const taskFailure = message.match(/failed:\s*(.+)$/i)?.[1]?.trim();
    return taskFailure ? { message: taskFailure } : undefined;
  }
  try {
    const parsed = JSON.parse(jsonText) as {
      error?: {
        code?: unknown;
        message?: unknown;
        param?: unknown;
        type?: unknown;
      };
    };
    return {
      code: typeof parsed.error?.code === "string" ? parsed.error.code : undefined,
      message: typeof parsed.error?.message === "string" ? parsed.error.message : undefined,
      param: typeof parsed.error?.param === "string" && parsed.error.param ? parsed.error.param : undefined,
      type: typeof parsed.error?.type === "string" ? parsed.error.type : undefined
    };
  } catch {
    return undefined;
  }
}

function isSeedanceReferenceImageDownloadFailure(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("image_url") && lower.includes("resource download failed");
}

function isSeedanceOutputDownloadFailure(message: string, details?: ReadableVideoProviderErrorInput): boolean {
  if (details?.providerPhase !== "download-output") {
    return false;
  }
  const diagnostic = [message, details.causeMessage ?? "", details.causeCode ?? ""].join(" ").toLowerCase();
  return diagnostic.includes("fetch failed") ||
    diagnostic.includes("timeout") ||
    diagnostic.includes("und_err_connect_timeout") ||
    diagnostic.includes("headers timeout");
}

function seedanceReferenceImageIndex(message: string): number | undefined {
  const match = message.match(/content\[(\d+)\]\.image_url/i);
  if (!match) {
    return undefined;
  }
  const contentIndex = Number(match[1]);
  if (!Number.isFinite(contentIndex) || contentIndex <= 0) {
    return undefined;
  }
  return contentIndex;
}

function isTooManySeedanceReferenceImages(message: string): boolean {
  return (
    message.includes("expected at most 9 reference images") ||
    message.includes("got 10 instead") ||
    message.includes('"param":"content"') && message.includes("reference images")
  );
}

function seedanceReferenceImageCount(message: string): number | undefined {
  const match = message.match(/got\s+(\d+)\s+instead/i);
  return match ? Number(match[1]) : undefined;
}
