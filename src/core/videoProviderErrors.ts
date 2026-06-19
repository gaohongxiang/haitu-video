export interface ReadableVideoProviderErrorInput {
  message?: string;
  providerPhase?: string;
  referenceImageCount?: number;
}

export const maxSeedanceReferenceImages = 9;

export function readableVideoProviderError(input: ReadableVideoProviderErrorInput | string | undefined): string {
  const details = typeof input === "string" ? { message: input } : input;
  const message = details?.message ?? "";
  if (!message) {
    return "";
  }

  if (isTooManySeedanceReferenceImages(message)) {
    const count = seedanceReferenceImageCount(message) ?? details?.referenceImageCount;
    return count && count > maxSeedanceReferenceImages
      ? `参考图太多：Seedance 最多支持 ${maxSeedanceReferenceImages} 张，本次有 ${count} 张。生成时只使用前 ${maxSeedanceReferenceImages} 张，请调整顺序或删除多余图片后重试。`
      : `参考图太多：Seedance 最多支持 ${maxSeedanceReferenceImages} 张。生成时只使用前 ${maxSeedanceReferenceImages} 张，请调整顺序或删除多余图片后重试。`;
  }

  if (
    message.includes("InputImageSensitiveContentDetected.PrivacyInformation") ||
    message.includes("input image may contain real person")
  ) {
    return "参考图里可能包含真人、人脸或隐私信息，视频平台已拒绝生成。请移除含人物或人脸的参考图，保留纯商品图后重试。";
  }

  if (message.includes("Missing SEEDANCE_API_KEY") || message.includes("Missing ARK_API_KEY")) {
    return "还没有配置视频模型 API Key。请先到 API 管理里配置 Seedance/火山视频模型密钥，再生成视频。";
  }

  if (message.includes("fetch failed") || message.includes("Headers Timeout Error")) {
    return "视频平台请求超时或网络连接失败，请稍后重试；如果连续失败，请检查视频模型配置和参考图链接。";
  }

  if (message.includes("rate limit") || message.includes("Too Many Requests") || message.includes("429")) {
    return "视频平台请求太频繁或触发限流，请稍后再试。";
  }

  if (message.includes("quota") || message.includes("insufficient") || message.includes("balance")) {
    return "视频平台账号额度不足或余额异常，请检查火山/Seedance 账号额度后再试。";
  }

  if (message.includes("Volcengine Seedance API error") || message.includes("Volcengine Seedance task")) {
    return "视频平台拒绝了这次生成请求。请检查参考图、商品资料和视频模型配置后重试。";
  }

  return message;
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
