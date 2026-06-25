export type ModelPricingProviderId = "openai" | "deepseek" | "volcengine";
export type ModelPricingKind = "text" | "image" | "video";
export type ModelPricingStatus = "verified" | "official-reference";

export interface ModelPricingProvider {
  id: ModelPricingProviderId;
  name: string;
  summary: string;
  sourceUrl: string;
  sourceLabel: string;
}

export interface ModelPricingEntry {
  providerId: ModelPricingProviderId;
  model: string;
  label: string;
  kind: ModelPricingKind;
  unit: string;
  input: string;
  cachedInput?: string;
  output: string;
  note?: string;
  status: ModelPricingStatus;
  sourceUrl: string;
}

export const modelPricingUpdatedAt = "2026-06-24";

export const modelPricingProviders = [
  {
    id: "openai",
    name: "OpenAI",
    summary: "官方 API 定价页按每 1M tokens 报价，缓存输入另计。",
    sourceUrl: "https://developers.openai.com/api/docs/pricing",
    sourceLabel: "OpenAI API pricing"
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    summary: "官方价格页按每 1M tokens 报价，并区分缓存命中与未命中。",
    sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing",
    sourceLabel: "DeepSeek Models & Pricing"
  },
  {
    id: "volcengine",
    name: "火山引擎",
    summary: "火山方舟官方模型价格页按人民币报价；视频生成还需结合分辨率、时长和是否含输入视频估算。",
    sourceUrl: "https://www.volcengine.com/docs/82379/1544106",
    sourceLabel: "火山方舟模型价格"
  }
] as const satisfies readonly ModelPricingProvider[];

export const modelPricingCatalog = [
  {
    providerId: "openai",
    model: "gpt-5.5",
    label: "旗舰文本",
    kind: "text",
    unit: "/ 1M tokens",
    input: "US$5.00",
    cachedInput: "US$0.50",
    output: "US$30.00",
    note: "短上下文标准层价格；长上下文、Batch、Flex、Priority 会不同。",
    status: "verified",
    sourceUrl: "https://developers.openai.com/api/docs/pricing"
  },
  {
    providerId: "openai",
    model: "gpt-5",
    label: "通用文本",
    kind: "text",
    unit: "/ 1M tokens",
    input: "US$1.25",
    cachedInput: "US$0.125",
    output: "US$10.00",
    note: "适合脚本、商品资料整理和多步骤推理的价格基准。",
    status: "verified",
    sourceUrl: "https://developers.openai.com/api/docs/pricing"
  },
  {
    providerId: "openai",
    model: "gpt-5-mini",
    label: "低成本文本",
    kind: "text",
    unit: "/ 1M tokens",
    input: "US$0.25",
    cachedInput: "US$0.025",
    output: "US$2.00",
    note: "适合批量草稿、轻量整理和低成本试跑。",
    status: "verified",
    sourceUrl: "https://developers.openai.com/api/docs/pricing"
  },
  {
    providerId: "openai",
    model: "gpt-4.1",
    label: "经典文本",
    kind: "text",
    unit: "/ 1M tokens",
    input: "US$2.00",
    cachedInput: "US$0.50",
    output: "US$8.00",
    status: "verified",
    sourceUrl: "https://developers.openai.com/api/docs/pricing"
  },
  {
    providerId: "openai",
    model: "gpt-4o-mini",
    label: "经济多模态",
    kind: "text",
    unit: "/ 1M tokens",
    input: "US$0.15",
    cachedInput: "US$0.075",
    output: "US$0.60",
    status: "verified",
    sourceUrl: "https://developers.openai.com/api/docs/pricing"
  },
  {
    providerId: "deepseek",
    model: "deepseek-v4-flash",
    label: "快速文本",
    kind: "text",
    unit: "/ 1M tokens",
    input: "US$0.14",
    cachedInput: "US$0.0028",
    output: "US$0.28",
    note: "官方表中对应 DeepSeek-V4-Flash；旧 deepseek-chat 将于 2026-07-24 后弃用。",
    status: "verified",
    sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing"
  },
  {
    providerId: "deepseek",
    model: "deepseek-v4-pro",
    label: "高质量文本",
    kind: "text",
    unit: "/ 1M tokens",
    input: "US$0.435",
    cachedInput: "US$0.003625",
    output: "US$0.87",
    note: "官方表中对应 DeepSeek-V4-Pro；适合更重的推理与生成任务。",
    status: "verified",
    sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing"
  },
  {
    providerId: "volcengine",
    model: "doubao-seed-2.0-pro",
    label: "豆包文本",
    kind: "text",
    unit: "/ 1M tokens",
    input: "¥3.20",
    cachedInput: "¥0.017",
    output: "¥16.00",
    note: "在线推理、输入长度 [0,32k] 价格；32k 以上输入/输出单价会分段升高，缓存输出按 ¥0.64/1M tokens 起。",
    status: "verified",
    sourceUrl: "https://www.volcengine.com/docs/82379/1544106"
  },
  {
    providerId: "volcengine",
    model: "doubao-seedream-5.0-lite",
    label: "图片生成",
    kind: "image",
    unit: "/ 张",
    input: "按张计费",
    cachedInput: "成功输出",
    output: "¥0.22 / 张",
    note: "官方价格页按成功输出图片数量计费；组图场景按实际生成张数计费，审核等原因未成功输出不计费。",
    status: "verified",
    sourceUrl: "https://www.volcengine.com/docs/82379/1544106"
  },
  {
    providerId: "volcengine",
    model: "doubao-seedance-2.0-fast",
    label: "快速视频",
    kind: "video",
    unit: "/ 1M tokens",
    input: "¥37.00",
    cachedInput: "含视频 ¥22.00",
    output: "480p 5s ¥1.86 / 720p 5s ¥4.00",
    note: "官方按 token 计费；这里列输入不含视频的在线推理单价，输入包含视频为 ¥22.00/1M tokens，示例为 16:9 输出 5 秒。",
    status: "verified",
    sourceUrl: "https://www.volcengine.com/docs/82379/1544106"
  },
  {
    providerId: "volcengine",
    model: "doubao-seedance-2.0",
    label: "高质量视频",
    kind: "video",
    unit: "/ 1M tokens",
    input: "¥46.00",
    cachedInput: "含视频 ¥28.00",
    output: "480p 5s ¥2.31 / 720p 5s ¥4.97",
    note: "官方按 token 计费；这里列 480p/720p 输入不含视频在线推理单价，1080p 为 ¥51.00/1M tokens，4k 为 ¥26.00/1M tokens。",
    status: "verified",
    sourceUrl: "https://www.volcengine.com/docs/82379/1544106"
  }
] as const satisfies readonly ModelPricingEntry[];

export function pricingEntriesForProvider(providerId: ModelPricingProviderId): ModelPricingEntry[] {
  return modelPricingCatalog.filter((entry) => entry.providerId === providerId);
}
