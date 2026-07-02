export type ModelPricingProviderId = "openai" | "deepseek" | "gemini" | "volcengine";
export type ModelPricingKind = "text" | "image" | "video";
export type ModelPricingStatus = "verified" | "official-reference";
export type ModelPricingCurrency = "CNY" | "USD";
export type ModelPricingUnit = "text_tokens_1m" | "image" | "image_tokens_1m" | "video_tokens_1m" | "call";
export type ModelPricingSource = "official_snapshot" | "fallback";
export type VideoPricingResolution = "480p" | "720p" | "1080p" | "4k";
export type ModelCatalogProviderId = "openai-compatible-text" | "openai-compatible-image" | "volcengine-seedance";
export type ModelCatalogSource = "official_docs" | "provider_models_api" | "manual";

export interface ModelCatalogMetadata {
  providerId: ModelCatalogProviderId;
  vendor: string;
  label: string;
  modelId: string;
  baseUrl: string;
  apiMode?: string;
  priority: number;
  enabledByDefault: boolean;
  capabilities: readonly string[];
  taskScopes?: readonly string[];
  tags: readonly string[];
  docsUrl?: string;
  source: ModelCatalogSource;
}

export interface ModelPricingProvider {
  id: ModelPricingProviderId;
  resourceKey: string;
  name: string;
  summary: string;
  sourceUrl: string;
  sourceLabel: string;
}

export interface ModelPricingExample {
  label: string;
  value: string;
}

export interface ModelPricingEntry {
  providerId: ModelPricingProviderId;
  model: string;
  aliases?: readonly string[];
  resourceKey: string;
  label: string;
  kind: ModelPricingKind;
  unit: string;
  input: string;
  cachedInput?: string;
  output: string;
  note?: string;
  billingNote?: string;
  costFactors?: readonly string[];
  formula?: string;
  examples?: readonly ModelPricingExample[];
  status: ModelPricingStatus;
  sourceUrl: string;
  catalog?: ModelCatalogMetadata;
  settlement?: ModelPricingSettlementRule;
  inputPriceCnyPerMillion?: number;
  outputPriceCnyPerMillion?: number;
  cachedInputPriceCnyPerMillion?: number;
  fallbackPriceCnyPerCall?: number;
  imagePriceCnyPerImage?: number;
  videoTokenPriceCnyPerMillion?: number;
  videoTokenPriceCnyPerMillionByResolution?: Partial<Record<VideoPricingResolution, number>>;
}

export type ModelPricingSettlementRule =
  | TextTokenPricingRule
  | ImagePricingRule
  | VideoTokenPricingRule;

export interface TextTokenPricingRule {
  kind: "text";
  currency: ModelPricingCurrency;
  unit: "text_tokens_1m";
  inputPriceCnyPerMillion: number;
  outputPriceCnyPerMillion: number;
  cachedInputPriceCnyPerMillion?: number;
  fallbackPriceCnyPerCall?: number;
  exchangeRate?: {
    from: "USD";
    to: "CNY";
    rate: number;
  };
}

export interface ImagePricingRule {
  kind: "image";
  currency: ModelPricingCurrency;
  unit: "image" | "image_tokens_1m";
  imagePriceCnyPerImage?: number;
  inputPriceCnyPerMillion?: number;
  outputPriceCnyPerMillion?: number;
  cachedInputPriceCnyPerMillion?: number;
}

export interface VideoTokenPricingRule {
  kind: "video";
  currency: "CNY";
  unit: "video_tokens_1m";
  videoTokenPriceCnyPerMillion?: number;
  videoTokenPriceCnyPerMillionByResolution?: Partial<Record<VideoPricingResolution, number>>;
}

export const officialModelPricingUpdatedAt = "2026-06-24";

export const officialModelPricingProviders = [
  {
    id: "openai",
    resourceKey: "openai",
    name: "OpenAI",
    summary: "官方 API 定价页按每 1M tokens 报价，缓存输入另计。",
    sourceUrl: "https://developers.openai.com/api/docs/pricing",
    sourceLabel: "OpenAI API pricing"
  },
  {
    id: "deepseek",
    resourceKey: "deepseek",
    name: "DeepSeek",
    summary: "官方价格页按每 1M tokens 报价，并区分缓存命中与未命中。",
    sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing",
    sourceLabel: "DeepSeek Models & Pricing"
  },
  {
    id: "gemini",
    resourceKey: "gemini",
    name: "Gemini",
    summary: "Google Gemini 官方价格页按模型和生成类型报价；本站按人民币成本快照入账。",
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    sourceLabel: "Gemini API pricing"
  },
  {
    id: "volcengine",
    resourceKey: "volcengine",
    name: "火山引擎",
    summary: "火山方舟官方模型价格页按人民币报价；视频生成还需结合分辨率、时长和是否含输入视频估算。",
    sourceUrl: "https://www.volcengine.com/docs/82379/1544106",
    sourceLabel: "火山方舟模型价格"
  }
] as const satisfies readonly ModelPricingProvider[];

const usdToCnyForOfficialSnapshot = 7.25;

export const officialModelPricingCatalog = [
  {
    providerId: "openai",
    model: "gpt-5.5",
    aliases: ["gpt-5.5-review"],
    resourceKey: "gpt55",
    label: "旗舰文本",
    kind: "text",
    unit: "/ 1M tokens",
    input: "US$5.00",
    cachedInput: "US$0.50",
    output: "US$30.00",
    note: "短上下文标准层价格；长上下文、Flex、Priority 会不同。",
    billingNote: "默认按即时标准价估算。缓存输入是重复的相同 prompt 前缀自动命中后的输入折扣，首次请求通常按输入价计费。批量异步价只适合后台批量任务，用户不需要马上拿结果时再考虑。",
    costFactors: ["文本输入 tokens", "缓存输入命中", "生成输出 tokens"],
    formula: "文本总成本 = 输入 tokens / 1M × US$5.00 + 输出 tokens / 1M × US$30.00；缓存命中输入按 tokens / 1M × US$0.50",
    examples: [
      { label: "100k 输入 + 20k 输出", value: "US$1.10" },
      { label: "100k 缓存输入 + 20k 输出", value: "US$0.65" }
    ],
    status: "verified",
    sourceUrl: "https://developers.openai.com/api/docs/pricing",
    catalog: {
      providerId: "openai-compatible-text",
      vendor: "openai",
      label: "gpt-5.5",
      modelId: "gpt-5.5",
      baseUrl: "https://api.openai.com",
      apiMode: "responses_stream",
      priority: 100,
      enabledByDefault: true,
      capabilities: ["商品整理", "脚本分镜"],
      taskScopes: ["product_import", "storyboard"],
      tags: ["高质量", "推荐"],
      docsUrl: "https://platform.openai.com/docs/models",
      source: "official_docs"
    },
    inputPriceCnyPerMillion: 5 * usdToCnyForOfficialSnapshot,
    outputPriceCnyPerMillion: 30 * usdToCnyForOfficialSnapshot,
    cachedInputPriceCnyPerMillion: 0.5 * usdToCnyForOfficialSnapshot,
    fallbackPriceCnyPerCall: 0.2,
    settlement: usdTextSettlementRule({
      input: 5,
      output: 30,
      cachedInput: 0.5,
      fallbackPriceCnyPerCall: 0.2
    })
  },
  {
    providerId: "openai",
    model: "gpt-image-2",
    resourceKey: "gptImage2",
    label: "图片生成",
    kind: "image",
    unit: "/ 1M image tokens",
    input: "US$8.00",
    cachedInput: "US$2.00",
    output: "US$30.00",
    note: "图片生成按图像 token 计费；文本输入另按 gpt-5.5 文本价格计费。",
    billingNote: "默认按即时标准价估算。缓存图像输入是重复使用完全相同的图片或 prompt 前缀时自动命中的输入折扣，首次生成通常按图片输入价计费。批量异步价只适合后台批量任务，用户不需要马上拿结果时再考虑。",
    costFactors: ["文本输入 tokens", "图片输入 tokens", "图片输出 tokens", "缓存输入命中"],
    formula: "图片总成本 = 文本输入 tokens / 1M × US$5.00 + 图片输入 tokens / 1M × US$8.00 + 图片输出 tokens / 1M × US$30.00",
    examples: [
      { label: "10k 文本 + 100k 图片输入 + 100k 图片输出", value: "US$3.85" },
      { label: "缓存 100k 图片输入 + 100k 图片输出", value: "US$3.20" }
    ],
    status: "verified",
    sourceUrl: "https://developers.openai.com/api/docs/pricing",
    catalog: {
      providerId: "openai-compatible-image",
      vendor: "openai",
      label: "gpt-image-2",
      modelId: "gpt-image-2",
      baseUrl: "https://api.openai.com",
      priority: 100,
      enabledByDefault: true,
      capabilities: ["商品图生成", "素材图生成"],
      tags: ["高质量", "推荐"],
      docsUrl: "https://developers.openai.com/api/docs/models/gpt-image-2",
      source: "official_docs"
    },
    imagePriceCnyPerImage: 0.3,
    inputPriceCnyPerMillion: 8 * usdToCnyForOfficialSnapshot,
    outputPriceCnyPerMillion: 30 * usdToCnyForOfficialSnapshot,
    cachedInputPriceCnyPerMillion: 2 * usdToCnyForOfficialSnapshot,
    settlement: {
      kind: "image",
      currency: "USD",
      unit: "image",
      imagePriceCnyPerImage: 0.3,
      inputPriceCnyPerMillion: 8 * usdToCnyForOfficialSnapshot,
      outputPriceCnyPerMillion: 30 * usdToCnyForOfficialSnapshot,
      cachedInputPriceCnyPerMillion: 2 * usdToCnyForOfficialSnapshot
    }
  },
  {
    providerId: "gemini",
    model: "gemini-3-pro-image-preview",
    resourceKey: "gemini3ProImagePreview",
    label: "Gemini 高质量图片",
    kind: "image",
    unit: "/ 张",
    input: "按张估算",
    output: "¥0.60 / 张",
    note: "Google 官方 Gemini 图片生成价格参考；通过 OpenAI-compatible 图片接口运行时，仍按真实 Gemini 模型名请求。",
    status: "official-reference",
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    catalog: {
      providerId: "openai-compatible-image",
      vendor: "gemini",
      label: "gemini-3-pro-image",
      modelId: "gemini-3-pro-image-preview",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      priority: 90,
      enabledByDefault: false,
      capabilities: ["商品图生成", "素材图生成"],
      tags: ["高质量"],
      docsUrl: "https://ai.google.dev/gemini-api/docs/image-generation",
      source: "official_docs"
    },
    imagePriceCnyPerImage: 0.6,
    settlement: {
      kind: "image",
      currency: "CNY",
      unit: "image",
      imagePriceCnyPerImage: 0.6
    }
  },
  {
    providerId: "gemini",
    model: "gemini-2.5-flash-image",
    resourceKey: "gemini25FlashImage",
    label: "Gemini 快速图片",
    kind: "image",
    unit: "/ 张",
    input: "按张估算",
    output: "¥0.30 / 张",
    note: "Google 官方 Gemini 图片生成价格参考；通过 OpenAI-compatible 图片接口运行时，仍按真实 Gemini 模型名请求。",
    status: "official-reference",
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    catalog: {
      providerId: "openai-compatible-image",
      vendor: "gemini",
      label: "gemini-2.5-flash-image",
      modelId: "gemini-2.5-flash-image",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      priority: 80,
      enabledByDefault: false,
      capabilities: ["商品图生成", "素材图生成"],
      tags: ["快速"],
      docsUrl: "https://ai.google.dev/gemini-api/docs/image-generation",
      source: "official_docs"
    },
    imagePriceCnyPerImage: 0.3,
    settlement: {
      kind: "image",
      currency: "CNY",
      unit: "image",
      imagePriceCnyPerImage: 0.3
    }
  },
  {
    providerId: "deepseek",
    model: "deepseek-v4-flash",
    aliases: ["deepseek-chat"],
    resourceKey: "deepseekV4Flash",
    label: "快速文本",
    kind: "text",
    unit: "/ 1M tokens",
    input: "US$0.14",
    cachedInput: "US$0.0028",
    output: "US$0.28",
    note: "官方表中对应 DeepSeek-V4-Flash；旧 deepseek-chat 将于 2026-07-24 后弃用。",
    costFactors: ["缓存未命中输入 tokens", "缓存命中输入 tokens", "生成输出 tokens"],
    formula: "文本总成本 = 缓存未命中输入 tokens / 1M × US$0.14 + 缓存命中输入 tokens / 1M × US$0.0028 + 输出 tokens / 1M × US$0.28",
    examples: [
      { label: "100k 未命中输入 + 20k 输出", value: "US$0.0196" },
      { label: "100k 命中输入 + 20k 输出", value: "US$0.00588" }
    ],
    status: "verified",
    sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing",
    catalog: {
      providerId: "openai-compatible-text",
      vendor: "deepseek",
      label: "deepseek-v4-flash",
      modelId: "deepseek-v4-flash",
      baseUrl: "https://api.deepseek.com",
      apiMode: "chat_completions",
      priority: 70,
      enabledByDefault: false,
      capabilities: ["商品整理", "脚本分镜"],
      taskScopes: ["product_import", "storyboard"],
      tags: ["快速", "低成本"],
      docsUrl: "https://api-docs.deepseek.com/news/news260424",
      source: "official_docs"
    },
    inputPriceCnyPerMillion: 0.14 * usdToCnyForOfficialSnapshot,
    outputPriceCnyPerMillion: 0.28 * usdToCnyForOfficialSnapshot,
    cachedInputPriceCnyPerMillion: 0.0028 * usdToCnyForOfficialSnapshot,
    fallbackPriceCnyPerCall: 0.01,
    settlement: usdTextSettlementRule({
      input: 0.14,
      output: 0.28,
      cachedInput: 0.0028,
      fallbackPriceCnyPerCall: 0.01
    })
  },
  {
    providerId: "deepseek",
    model: "deepseek-v4-pro",
    aliases: ["deepseek-reasoner"],
    resourceKey: "deepseekV4Pro",
    label: "高质量文本",
    kind: "text",
    unit: "/ 1M tokens",
    input: "US$0.435",
    cachedInput: "US$0.003625",
    output: "US$0.87",
    note: "官方表中对应 DeepSeek-V4-Pro；适合更重的推理与生成任务。",
    costFactors: ["缓存未命中输入 tokens", "缓存命中输入 tokens", "生成输出 tokens"],
    formula: "文本总成本 = 缓存未命中输入 tokens / 1M × US$0.435 + 缓存命中输入 tokens / 1M × US$0.003625 + 输出 tokens / 1M × US$0.87",
    examples: [
      { label: "100k 未命中输入 + 20k 输出", value: "US$0.0609" },
      { label: "100k 命中输入 + 20k 输出", value: "US$0.0177625" }
    ],
    status: "verified",
    sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing",
    catalog: {
      providerId: "openai-compatible-text",
      vendor: "deepseek",
      label: "deepseek-v4-pro",
      modelId: "deepseek-v4-pro",
      baseUrl: "https://api.deepseek.com",
      apiMode: "chat_completions",
      priority: 80,
      enabledByDefault: false,
      capabilities: ["商品整理", "脚本分镜"],
      taskScopes: ["product_import", "storyboard"],
      tags: ["高质量"],
      docsUrl: "https://api-docs.deepseek.com/api/list-models",
      source: "official_docs"
    },
    inputPriceCnyPerMillion: 0.435 * usdToCnyForOfficialSnapshot,
    outputPriceCnyPerMillion: 0.87 * usdToCnyForOfficialSnapshot,
    cachedInputPriceCnyPerMillion: 0.003625 * usdToCnyForOfficialSnapshot,
    fallbackPriceCnyPerCall: 0.01,
    settlement: usdTextSettlementRule({
      input: 0.435,
      output: 0.87,
      cachedInput: 0.003625,
      fallbackPriceCnyPerCall: 0.01
    })
  },
  {
    providerId: "volcengine",
    model: "doubao-seed-2.0-pro",
    aliases: ["doubao-seed-2-0-pro-260215"],
    resourceKey: "doubaoSeed20Pro",
    label: "豆包文本",
    kind: "text",
    unit: "/ 1M tokens",
    input: "¥3.20",
    cachedInput: "¥0.017",
    output: "¥16.00",
    note: "在线推理、输入长度 [0,32k] 价格；32k 以上输入/输出单价会分段升高，缓存输出按 ¥0.64/1M tokens 起。",
    costFactors: ["文本输入 tokens", "缓存输入命中", "生成输出 tokens", "长上下文分段"],
    formula: "文本总成本 = 输入 tokens / 1M × ¥3.20 + 输出 tokens / 1M × ¥16.00；缓存命中输入按 tokens / 1M × ¥0.017",
    examples: [
      { label: "100k 输入 + 20k 输出", value: "¥0.64" },
      { label: "100k 缓存输入 + 20k 输出", value: "¥0.3217" }
    ],
    status: "verified",
    sourceUrl: "https://www.volcengine.com/docs/82379/1544106",
    catalog: {
      providerId: "openai-compatible-text",
      vendor: "doubao",
      label: "doubao-seed-2.0-pro",
      modelId: "doubao-seed-2-0-pro-260215",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      apiMode: "chat_completions",
      priority: 75,
      enabledByDefault: false,
      capabilities: ["商品整理", "脚本分镜"],
      taskScopes: ["product_import", "storyboard"],
      tags: ["高质量", "多模态"],
      docsUrl: "https://www.volcengine.com/docs/82379/1330310",
      source: "official_docs"
    },
    inputPriceCnyPerMillion: 3.2,
    outputPriceCnyPerMillion: 16,
    cachedInputPriceCnyPerMillion: 0.017,
    fallbackPriceCnyPerCall: 0.02,
    settlement: {
      kind: "text",
      currency: "CNY",
      unit: "text_tokens_1m",
      inputPriceCnyPerMillion: 3.2,
      cachedInputPriceCnyPerMillion: 0.017,
      outputPriceCnyPerMillion: 16,
      fallbackPriceCnyPerCall: 0.02
    }
  },
  {
    providerId: "volcengine",
    model: "doubao-seedream-5.0-lite",
    aliases: ["doubao-seedream-5-0-lite"],
    resourceKey: "doubaoSeedream50Lite",
    label: "图片生成",
    kind: "image",
    unit: "/ 张",
    input: "按张计费",
    cachedInput: "成功输出",
    output: "¥0.22 / 张",
    note: "官方价格页按成功输出图片数量计费；组图场景按实际生成张数计费，审核等原因未成功输出不计费。",
    costFactors: ["成功输出张数", "组图生成张数", "失败或拦截输出"],
    formula: "图片总成本 = 成功输出图片张数 × ¥0.22",
    examples: [
      { label: "1 张成功输出", value: "¥0.22" },
      { label: "4 张组图成功输出", value: "¥0.88" }
    ],
    status: "verified",
    sourceUrl: "https://www.volcengine.com/docs/82379/1544106",
    catalog: {
      providerId: "openai-compatible-image",
      vendor: "doubao",
      label: "doubao-seedream-5.0-lite",
      modelId: "doubao-seedream-5-0-lite",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      priority: 70,
      enabledByDefault: false,
      capabilities: ["商品图生成", "素材图生成"],
      tags: ["低成本"],
      docsUrl: "https://www.volcengine.com/docs/82379/1330310",
      source: "official_docs"
    },
    imagePriceCnyPerImage: 0.22,
    settlement: {
      kind: "image",
      currency: "CNY",
      unit: "image",
      imagePriceCnyPerImage: 0.22
    }
  },
  {
    providerId: "volcengine",
    model: "doubao-seedance-2.0-fast",
    aliases: ["doubao-seedance-2-0-fast-260128"],
    resourceKey: "doubaoSeedance20Fast",
    label: "快速视频",
    kind: "video",
    unit: "/ 1M tokens",
    input: "¥37.00",
    cachedInput: "含视频 ¥22.00",
    output: "480p 5s ¥1.86 / 720p 5s ¥4.00",
    note: "官方按 token 计费；Seedance 2.0 fast 不支持输出 1080p 视频。示例为输入不含视频、16:9 输出 5 秒，准确用量以 API 返回的 usage.completion_tokens 为准。",
    costFactors: ["输出视频时长", "输出视频分辨率", "输出视频宽高比", "输出视频帧率", "是否包含输入视频"],
    formula: "费用 = token 单价 × (输入视频时长 + 输出视频时长) × 输出宽 × 输出高 × 帧率 / 1024",
    examples: [
      { label: "480p 16:9 5s", value: "¥1.86 / 条" },
      { label: "720p 16:9 5s", value: "¥4.00 / 条" },
      { label: "含输入视频 480p 5s", value: "¥1.99-4.42 / 条" },
      { label: "含输入视频 720p 5s", value: "¥4.28-9.50 / 条" }
    ],
    status: "verified",
    sourceUrl: "https://www.volcengine.com/docs/82379/1544106",
    catalog: {
      providerId: "volcengine-seedance",
      vendor: "volcengine",
      label: "seedance-2.0-fast",
      modelId: "doubao-seedance-2-0-fast-260128",
      baseUrl: "https://ark.cn-beijing.volces.com",
      priority: 100,
      enabledByDefault: true,
      capabilities: ["视频生成"],
      tags: ["快速", "推荐"],
      docsUrl: "https://www.volcengine.com/docs/82379/2291680",
      source: "official_docs"
    },
    videoTokenPriceCnyPerMillion: 37,
    settlement: {
      kind: "video",
      currency: "CNY",
      unit: "video_tokens_1m",
      videoTokenPriceCnyPerMillion: 37
    }
  },
  {
    providerId: "volcengine",
    model: "doubao-seedance-2.0",
    aliases: ["doubao-seedance-2-0-260128"],
    resourceKey: "doubaoSeedance20",
    label: "高质量视频",
    kind: "video",
    unit: "/ 1M tokens",
    input: "¥46.00",
    cachedInput: "含视频 ¥28.00",
    output: "480p 5s ¥2.31 / 720p 5s ¥4.97",
    note: "官方按 token 计费；480p/720p 输入不含视频为 ¥46/1M tokens，1080p 为 ¥51/1M tokens，4k 为 ¥26/1M tokens。示例为输入不含视频、16:9 输出 5 秒。",
    costFactors: ["输出视频时长", "输出视频分辨率", "输出视频宽高比", "输出视频帧率", "是否包含输入视频"],
    formula: "费用 = token 单价 × (输入视频时长 + 输出视频时长) × 输出宽 × 输出高 × 帧率 / 1024",
    examples: [
      { label: "480p 16:9 5s", value: "¥2.31 / 条" },
      { label: "720p 16:9 5s", value: "¥4.97 / 条" },
      { label: "1080p 16:9 5s", value: "¥12.39 / 条" },
      { label: "4k 16:9 5s", value: "¥25.27 / 条" }
    ],
    status: "verified",
    sourceUrl: "https://www.volcengine.com/docs/82379/1544106",
    catalog: {
      providerId: "volcengine-seedance",
      vendor: "volcengine",
      label: "seedance-2.0",
      modelId: "doubao-seedance-2-0-260128",
      baseUrl: "https://ark.cn-beijing.volces.com",
      priority: 90,
      enabledByDefault: false,
      capabilities: ["视频生成"],
      tags: ["高质量"],
      docsUrl: "https://www.volcengine.com/docs/82379/2291680",
      source: "official_docs"
    },
    videoTokenPriceCnyPerMillionByResolution: {
      "480p": 46,
      "720p": 46,
      "1080p": 51,
      "4k": 26
    },
    settlement: {
      kind: "video",
      currency: "CNY",
      unit: "video_tokens_1m",
      videoTokenPriceCnyPerMillionByResolution: {
        "480p": 46,
        "720p": 46,
        "1080p": 51,
        "4k": 26
      }
    }
  }
] as const satisfies readonly ModelPricingEntry[];

export function modelPricingEntryForModel(model: string | undefined): ModelPricingEntry | undefined {
  const normalized = normalizedModelName(model);
  if (!normalized) {
    return undefined;
  }
  return officialModelPricingCatalog.find((entry) => {
    return modelMatches(entry, normalized);
  });
}

export function providerForModelPricingEntry(entry: ModelPricingEntry | undefined): ModelPricingProvider | undefined {
  if (!entry) {
    return undefined;
  }
  return officialModelPricingProviders.find((provider) => provider.id === entry.providerId);
}

function modelMatches(entry: ModelPricingEntry, normalized: string): boolean {
  return normalizedModelName(entry.model) === normalized
    || Boolean(entry.aliases?.some((alias) => normalizedModelName(alias) === normalized));
}

function normalizedModelName(model: string | undefined): string | undefined {
  const normalized = model?.trim().toLowerCase();
  return normalized || undefined;
}

function usdTextSettlementRule(input: {
  input: number;
  output: number;
  cachedInput?: number;
  fallbackPriceCnyPerCall: number;
}): TextTokenPricingRule {
  return {
    kind: "text",
    currency: "USD",
    unit: "text_tokens_1m",
    inputPriceCnyPerMillion: input.input * usdToCnyForOfficialSnapshot,
    outputPriceCnyPerMillion: input.output * usdToCnyForOfficialSnapshot,
    cachedInputPriceCnyPerMillion: input.cachedInput === undefined ? undefined : input.cachedInput * usdToCnyForOfficialSnapshot,
    fallbackPriceCnyPerCall: input.fallbackPriceCnyPerCall,
    exchangeRate: {
      from: "USD",
      to: "CNY",
      rate: usdToCnyForOfficialSnapshot
    }
  };
}
