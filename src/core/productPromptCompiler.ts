import type { ProductFacts } from "./productFacts.js";
import type { VideoAspectRatio } from "../providers/types.js";
import type { AppLocale } from "../i18n/config.js";
import {
  defaultFinalVideoLanguage,
  finalVideoLanguageLabel,
  finalVideoLanguagePromptLabel,
  finalVideoLanguageRestriction,
  type FinalVideoLanguage
} from "./videoLanguage.js";

export type ProductPromptMode = "image" | "video";
export type ProductPromptCreativeStyle =
  | "auto"
  | "lifestyle"
  | "scene"
  | "benefit"
  | "ugc"
  | "unboxing"
  | "detail"
  | "pain-point";

export interface ProductPromptTargetModel {
  providerId: string;
  model?: string;
  vendor?: string;
  baseUrl?: string;
}

export interface ProductPromptCompileInput {
  locale?: AppLocale;
  mode: ProductPromptMode;
  product: ProductFacts;
  userPrompt?: string;
  referenceImages?: string[];
  targetModel: ProductPromptTargetModel;
  video?: {
    durationSeconds?: number;
    aspectRatio?: VideoAspectRatio;
    finalLanguage?: FinalVideoLanguage;
    creativeStyle?: ProductPromptCreativeStyle;
  };
}

export interface ProductPromptCompileResult {
  prompt: string;
  recipeId: "commercial-image@v1" | "seedance-video@v2" | "default-image@v1" | "default-video@v1";
  notes: string[];
}

export function compileProductPrompt(input: ProductPromptCompileInput): ProductPromptCompileResult {
  if (input.mode === "video") {
    return compileVideoPrompt(input);
  }
  return compileImagePrompt(input);
}

function compileImagePrompt(input: ProductPromptCompileInput): ProductPromptCompileResult {
  const recipeId = recipeIdForImage(input.targetModel);
  const locale = input.locale ?? "zh";
  const references = normalizeReferences(input.referenceImages);
  const product = input.product;
  const userIntent = normalizedUserPrompt(input.userPrompt, "清晰电商商品图");
  const userIntentSentence = sentence(userIntent, locale);
  const forbidden = mergedForbiddenClaims(product, locale === "en"
    ? [
      "text overlays",
      "random logos",
      "watermarks",
      "prices",
      "sales rankings",
      "unverified performance claims"
    ]
    : [
      "文字覆盖",
      "随机 logo",
      "水印",
      "价格",
      "销售排名",
      "未核验效果承诺"
    ]);

  const prompt = locale === "en"
    ? [
      "Create a clean ecommerce product image for a real product.",
      `Target image model: ${modelLabel(input.targetModel)}.`,
      references.length > 0
        ? `Use only these selected reference images as visual constraints: ${references.join(", ")}.`
        : "No reference image is selected for this generation; follow the product facts only.",
      "Preserve the real product appearance, shape, color, material texture, proportions, and visible details.",
      `Product title: ${product.title_ja}.`,
      product.category ? `Category: ${product.category}.` : "",
      product.materials.length > 0 ? `Materials: ${product.materials.join(", ")}.` : "",
      product.dimensions ? `Dimensions/weight: ${product.dimensions}.` : "",
      `User intent: ${userIntentSentence}`,
      "Composition:",
      imageCompositionForIntent(userIntent, locale),
      "Verified product facts to express visually:",
      ...bulletLines(product.verified_selling_points),
      "Usage context:",
      ...bulletLines(product.usage_scenes.length > 0 ? product.usage_scenes : ["clean ecommerce presentation"]),
      "Do not add text overlays, random logos, watermarks, prices, ranking badges, sales claims, or unverified product functions.",
      "Do not claim or imply:",
      ...bulletLines(forbidden)
    ].filter(Boolean).join("\n")
    : [
      "生成一张真实商品的干净电商商品图。",
      `目标图片模型：${modelLabel(input.targetModel)}。`,
      references.length > 0
        ? `只使用这些已选择的参考图作为商品视觉约束：${references.join(", ")}。`
        : "本次未选择参考图；仅根据商品资料约束商品事实。",
      "保持真实商品外观、形状、颜色、材质纹理、比例和可见细节。",
      `商品标题：${product.title_ja}。`,
      product.category ? `类目：${product.category}。` : "",
      product.materials.length > 0 ? `材质：${product.materials.join(", ")}。` : "",
      product.dimensions ? `尺寸/重量：${product.dimensions}。` : "",
      `用户意图：${userIntentSentence}`,
      "画面构图：",
      imageCompositionForIntent(userIntent, locale),
      "需要视觉表达的已核验商品事实：",
      ...bulletLines(product.verified_selling_points),
      "使用场景：",
      ...bulletLines(product.usage_scenes.length > 0 ? product.usage_scenes : ["干净电商展示"]),
      "不要添加文字覆盖、随机 logo、水印、价格、排名标识、销售话术或未核验功能。",
      "不要声称或暗示：",
      ...bulletLines(forbidden)
    ].filter(Boolean).join("\n");

  return {
    prompt,
    recipeId,
    notes: [locale === "en"
      ? `Compiled image model prompt with ${recipeId}.`
      : `已按 ${recipeId} 编译为图片模型提示词。`]
  };
}

function compileVideoPrompt(input: ProductPromptCompileInput): ProductPromptCompileResult {
  const recipeId = recipeIdForVideo(input.targetModel);
  const locale = input.locale ?? "zh";
  const references = normalizeReferences(input.referenceImages);
  const product = input.product;
  const durationSeconds = clampDuration(input.video?.durationSeconds);
  const aspectRatio = input.video?.aspectRatio ?? "9:16";
  const finalLanguage = input.video?.finalLanguage ?? defaultFinalVideoLanguage;
  const hasUserPrompt = Boolean(input.userPrompt?.trim());
  const userIntent = normalizedUserPrompt(input.userPrompt, locale === "en" ? "daily-use product short video" : "日常使用场景商品短视频");
  const userIntentSentence = sentence(userIntent, locale);
  const creativeStyle = resolvedCreativeStyle(input.video?.creativeStyle, hasUserPrompt ? userIntent : "");
  const forbidden = mergedForbiddenClaims(product, locale === "en"
    ? [
      "prices",
      "sales rankings",
      "best-selling badges",
      "medical protection",
      "unverified performance claims",
      "burned-in subtitles",
      "watermarks",
      "random logos"
    ]
    : [
      "价格",
      "销售排名",
      "畅销标识",
      "医疗级防护",
      "未核验效果承诺",
      "硬字幕",
      "水印",
      "随机 logo"
    ]);

  const prompt = locale === "en"
    ? [
      `Create a ${durationSeconds}-second vertical ${aspectRatio} TikTok Shop product video for a Japanese audience.`,
      `Target video model: ${modelLabel(input.targetModel)}.`,
      `Final video language: ${finalVideoLanguageLabel(finalLanguage)}. If any text, caption, sticker, label, UI overlay, subtitle, voiceover, or spoken line appears, it must use ${finalVideoLanguageLabel(finalLanguage)} only.`,
      finalVideoLanguageRestriction(finalLanguage, locale),
      references.length > 0
        ? `Use only these selected reference images as visual constraints for the product: ${references.join(", ")}.`
        : "No reference image is selected; constrain product appearance only with verified product facts.",
      "The product must keep its real shape, color, material texture, structure, proportions, and visible details. Treat product facts as constraints, not copywriting.",
      `Creative goal: ${userIntentSentence}`,
      "Video prompt:",
      ...buildVideoPromptLines({
        durationSeconds,
        userIntent,
        product,
        locale,
        recipeId,
        creativeStyle,
        hasReferences: references.length > 0,
        userPromptProvided: hasUserPrompt
      }),
      "Verified visual facts:",
      ...bulletLines(product.verified_selling_points),
      "Usage scenes:",
      ...bulletLines(product.usage_scenes),
      "Forbidden:",
      ...bulletLines(forbidden),
      "Do not create burned-in subtitles, prices, ranking badges, sales claims, random logos, watermarks, or unreadable text."
    ].filter(Boolean).join("\n")
    : [
      `生成 ${durationSeconds} 秒 ${aspectRatio} 竖版 TikTok Shop 商品视频，面向日本受众。`,
      `目标视频模型：${modelLabel(input.targetModel)}。`,
      `最终视频语言：${finalVideoLanguagePromptLabel(finalLanguage, locale)}。如果画面中出现文字、贴纸、标签、UI 覆盖、字幕、旁白或口播，只能使用${finalVideoLanguagePromptLabel(finalLanguage, locale)}。`,
      finalVideoLanguageRestriction(finalLanguage, locale),
      references.length > 0
        ? `只使用这些已选择的参考图作为商品视觉约束：${references.join(", ")}。`
        : "本次未选择参考图；商品外观只受商品资料中已核验事实约束。",
      "保持商品真实形状、颜色、材质纹理、结构、比例和可见细节。商品资料只作为事实约束，不要把长标题里的营销词当成已核验事实。",
      `创作目标：${userIntentSentence}`,
      "视频提示词：",
      ...buildVideoPromptLines({
        durationSeconds,
        userIntent,
        product,
        locale,
        recipeId,
        creativeStyle,
        hasReferences: references.length > 0,
        userPromptProvided: hasUserPrompt
      }),
      "已核验视觉事实：",
      ...bulletLines(product.verified_selling_points),
      "使用场景：",
      ...bulletLines(product.usage_scenes),
      "禁止：",
      ...bulletLines(forbidden),
      "不要生成硬字幕、价格、排名标识、销售承诺、随机 logo、水印或不可读文字。"
    ].filter(Boolean).join("\n");

  return {
    prompt,
    recipeId,
    notes: [locale === "en"
      ? `Compiled video model prompt with ${recipeId}.`
      : `已按 ${recipeId} 编译为视频模型提示词。`]
  };
}

function recipeIdForImage(targetModel: ProductPromptTargetModel): ProductPromptCompileResult["recipeId"] {
  if (targetModel.providerId === "openai-compatible-image") {
    return "commercial-image@v1";
  }
  return "default-image@v1";
}

function recipeIdForVideo(targetModel: ProductPromptTargetModel): ProductPromptCompileResult["recipeId"] {
  if (targetModel.providerId === "volcengine-seedance") {
    return "seedance-video@v2";
  }
  return "default-video@v1";
}

function buildVideoPromptLines(input: {
  durationSeconds: number;
  userIntent: string;
  product: ProductFacts;
  locale: AppLocale;
  recipeId: ProductPromptCompileResult["recipeId"];
  creativeStyle: Exclude<ProductPromptCreativeStyle, "auto">;
  hasReferences: boolean;
  userPromptProvided: boolean;
}): string[] {
  if (input.recipeId === "seedance-video@v2") {
    return buildSeedanceVideoPromptFormula(input);
  }
  return buildVideoFlow(input);
}

function buildSeedanceVideoPromptFormula(input: {
  durationSeconds: number;
  userIntent: string;
  product: ProductFacts;
  locale: AppLocale;
  creativeStyle: Exclude<ProductPromptCreativeStyle, "auto">;
  hasReferences: boolean;
  userPromptProvided: boolean;
}): string[] {
  const scene = videoSceneFromProduct(input.product, input.locale);
  const userIntentSentence = input.userPromptProvided && shouldIncludeUserIntentInActionSlot(input.userIntent)
    ? sentence(input.userIntent, input.locale)
    : "";
  const productIdentity = videoProductIdentity(input.product, input.locale);
  const productSource = input.hasReferences
    ? input.locale === "en"
      ? "Use the selected reference images as the product appearance source"
      : "商品以已选参考图为准"
    : input.locale === "en"
      ? "Use verified product facts as the product appearance source"
      : "商品以已核验商品资料为准";
  const styleSlots = seedanceCreativeStyleSlots(input.creativeStyle, input.locale, {
    scene,
    userIntentSentence,
    durationSeconds: input.durationSeconds
  });

  if (input.locale === "en") {
    return [
      `Real TikTok Shop product video. ${productSource}; ${productIdentity}.`,
      `Action: ${styleSlots.action}`,
      `Environment: ${styleSlots.environment}`,
      `Lighting and mood: ${styleSlots.lighting}`,
      `Camera movement: ${styleSlots.camera}`,
      `Visual style: ${styleSlots.visualStyle}`,
      "Quality and restrictions: high detail, sharp focus, stable product appearance, accurate material texture, natural hand movement, no flickering, no object clipping; use only verified product facts and selected references; do not invent material, function, certification, price, ranking, sales volume, logo, watermark, subtitles, unreadable text, face distortion, body deformation, or product shape changes."
    ];
  }

  return [
    `真实 TikTok Shop 商品短视频。${productSource}，保持真实外观；${productIdentity}。`,
    `动作：${styleSlots.action}`,
    `环境：${styleSlots.environment}`,
    `光线与氛围：${styleSlots.lighting}`,
    `镜头运动：${styleSlots.camera}`,
    `视觉风格：${styleSlots.visualStyle}`,
    "质量与限制：高细节，清晰对焦，商品外观稳定，材质纹理准确，手部动作自然，无闪烁，无物体穿插；只使用已核验商品事实和已选择参考图，不虚构材质、功能、认证、价格、排名、销量、logo、水印、硬字幕、不可读文字、脸部畸变、身体变形或商品形状变化。"
  ];
}

function resolvedCreativeStyle(style: ProductPromptCreativeStyle | undefined, userIntent: string): Exclude<ProductPromptCreativeStyle, "auto"> {
  if (style && style !== "auto") {
    return style;
  }
  if (/UGC|用户|手持|第一视角|first person|handheld|user[- ]?generated/i.test(userIntent)) {
    return "ugc";
  }
  if (/生活化|日常|种草|lifestyle|daily|natural/i.test(userIntent)) {
    return "lifestyle";
  }
  if (/开箱|unbox|包装|打开/i.test(userIntent)) {
    return "unboxing";
  }
  if (/细节|detail|texture|材质|近景|特写/i.test(userIntent)) {
    return "detail";
  }
  if (/卖点|benefit|优势|highlight/i.test(userIntent)) {
    return "benefit";
  }
  if (/痛点|pain|不便|problem/i.test(userIntent)) {
    return "pain-point";
  }
  return "scene";
}

function seedanceCreativeStyleSlots(
  style: Exclude<ProductPromptCreativeStyle, "auto">,
  locale: AppLocale,
  context: {
    scene: string;
    userIntentSentence: string;
    durationSeconds: number;
  }
): {
  action: string;
  environment: string;
  lighting: string;
  camera: string;
  visualStyle: string;
} {
  if (locale === "en") {
    if (style === "lifestyle") {
      return {
        action: joinPromptSentences([
          "A real user naturally picks up, wears, or uses the product.",
          context.userIntentSentence,
          `Keep the product clearly visible throughout the ${context.durationSeconds}-second video.`
        ], " "),
        environment: `Everyday commuting, outdoor movement, or casual daily-life setting based on the product facts: ${context.scene}`,
        lighting: "natural daylight, relaxed and real daily-life mood, not overly staged or glossy.",
        camera: "light handheld follow shot, medium shot for the wearing/use effect, close-up for visible structure and material details.",
        visualStyle: "authentic TikTok daily recommendation style, natural and lightly commercial."
      };
    }
    if (style === "benefit") {
      return {
        action: joinPromptSentences([
          "Show the product around verified selling points.",
          context.userIntentSentence,
          "Keep each visual claim grounded in product facts."
        ], " "),
        environment: `Clean ecommerce scene or clear use context based on the product facts: ${context.scene}`,
        lighting: "clear bright commercial lighting that makes product details easy to read.",
        camera: "full product view, then verified detail close-ups, then practical use effect, with stable focus.",
        visualStyle: "clear direct ecommerce ad display style."
      };
    }
    if (style === "ugc") {
      return {
        action: joinPromptSentences([
          "A real user picks up, wears, tries, or shows the product.",
          context.userIntentSentence,
          "Avoid a polished advertising performance."
        ], " "),
        environment: "phone-shot daily environment such as a desk, doorway, street, room, or outdoor route.",
        lighting: "natural available light, honest user-shot mood, no heavy studio look.",
        camera: "slight handheld motion, first-person or close user perspective, close enough to inspect the product without distortion.",
        visualStyle: "authentic UGC user sharing style."
      };
    }
    if (style === "unboxing") {
      return {
        action: joinPromptSentences([
          "Open, take out, arrange, and show the product structure.",
          context.userIntentSentence
        ], " "),
        environment: "clean tabletop, package-opening, or simple home setup with minimal clutter.",
        lighting: "soft clean light, fresh opening mood, product details easy to inspect.",
        camera: "top or front tabletop opening shot, slow push-in to product structure, close-up on verified details, final clean product shot.",
        visualStyle: "clean ecommerce unboxing style."
      };
    }
    if (style === "detail") {
      return {
        action: joinPromptSentences([
          "Slowly show visible product details, texture, edges, openings, structure, and wearing/use method.",
          context.userIntentSentence
        ], " "),
        environment: "simple clean background or quiet use context that keeps details readable.",
        lighting: "soft directional light that reveals texture and structure without exaggeration.",
        camera: "stable close-ups, macro-like detail framing, slow push-in, then one full product shot for context.",
        visualStyle: "product detail showcase style."
      };
    }
    if (style === "pain-point") {
      return {
        action: joinPromptSentences([
          "Briefly show a real inconvenience, then show how the product is used in that situation.",
          context.userIntentSentence,
          "Do not exaggerate the problem or claim unverified effects."
        ], " "),
        environment: `Practical daily-use situation based on product facts: ${context.scene}`,
        lighting: "realistic natural light, practical problem-solving mood, no fear-based atmosphere.",
        camera: "start on the use situation, move to the product entering the frame, close-up on verified details, end on the practical use result.",
        visualStyle: "practical ecommerce problem-solution style."
      };
    }
    return {
      action: joinPromptSentences([
        context.userIntentSentence,
        `Keep the product clearly visible throughout the ${context.durationSeconds}-second video and show natural handling or use.`
      ], " "),
      environment: context.scene,
      lighting: "clean realistic commercial lighting, practical daily-use mood, natural highlights on the product material, no exaggerated fantasy atmosphere.",
      camera: "start with a stable medium product shot, use a slow dolly-in or gentle handheld movement, move closer to show visible product structure, wearing/use method, and verified details, then end with a clean product-focused shot.",
      visualStyle: "realistic TikTok Shop ecommerce video, clear product identity, natural motion, simple background, enough space for platform UI."
    };
  }

  if (style === "lifestyle") {
    return {
      action: joinPromptSentences([
        "真实用户自然拿起、佩戴或使用商品。",
        context.userIntentSentence,
        `${context.durationSeconds} 秒内商品始终清晰可见。`
      ], ""),
      environment: `日常通勤、户外移动或自然生活场景，并贴合商品资料：${context.scene}`,
      lighting: "自然日光，轻松、真实、日常，不要过度商业棚拍感。",
      camera: "轻微手持跟拍，中景展示佩戴/使用效果，近景展示商品可见结构和材质细节。",
      visualStyle: "真实 TikTok 日常种草风，画面自然，有轻商业质感。"
    };
  }
  if (style === "benefit") {
    return {
      action: joinPromptSentences([
        "围绕已核验卖点展示商品。",
        context.userIntentSentence,
        "每个画面表达都必须能从商品资料或已选参考图中得到依据。"
      ], ""),
      environment: `干净电商场景或明确使用场景，并贴合商品资料：${context.scene}`,
      lighting: "清晰、明亮、突出商品细节，避免夸张功效氛围。",
      camera: "整体展示商品，再推进到已核验卖点细节，最后展示实际使用效果，焦点稳定。",
      visualStyle: "清晰直接的电商广告展示风。"
    };
  }
  if (style === "ugc") {
    return {
      action: joinPromptSentences([
        "像真实用户拿起、佩戴、试用或展示商品。",
        context.userIntentSentence,
        "不要演成精致广告片。"
      ], ""),
      environment: "手机拍摄感的日常环境，比如桌边、门口、街道、房间或户外路线。",
      lighting: "真实自然光，轻松、不刻意，避免强棚拍感。",
      camera: "轻微手持，第一视角或近距离用户视角，能看清商品但不变形。",
      visualStyle: "真实 UGC 用户分享风。"
    };
  }
  if (style === "unboxing") {
    return {
      action: joinPromptSentences([
        "打开、取出、整理并展示商品结构。",
        context.userIntentSentence
      ], ""),
      environment: "干净桌面、开箱或居家摆放环境，背景简单不杂乱。",
      lighting: "柔和干净的开箱光线，清爽、易看清商品细节。",
      camera: "俯拍或正面桌面开箱，缓慢推进到商品结构和已核验细节，最后完整商品定格。",
      visualStyle: "干净电商开箱展示风。"
    };
  }
  if (style === "detail") {
    return {
      action: joinPromptSentences([
        "缓慢展示商品可见细节、材质纹理、边缘、开孔、结构和佩戴/使用方式。",
        context.userIntentSentence
      ], ""),
      environment: "简单干净背景或安静使用场景，让细节易读。",
      lighting: "柔和定向光，真实呈现纹理和结构，不夸张美化材质。",
      camera: "稳定近景和细节特写，慢速推进，最后回到一个完整商品画面。",
      visualStyle: "商品细节展示风。"
    };
  }
  if (style === "pain-point") {
    return {
      action: joinPromptSentences([
        "先展示真实使用中的轻微不便，再展示商品如何被使用。",
        context.userIntentSentence,
        "不夸大痛点，不制造焦虑。"
      ], ""),
      environment: `基于商品资料的真实日常使用情境：${context.scene}`,
      lighting: "真实自然光，实用解决问题的氛围，不要恐吓或夸张对比。",
      camera: "从使用情境开场，商品进入画面，近景展示已核验细节，最后展示实际使用状态。",
      visualStyle: "实用电商问题解决风。"
    };
  }
  return {
    action: joinPromptSentences([
      context.userIntentSentence,
      `${context.durationSeconds} 秒内商品始终清晰可见，自然展示拿取、佩戴、使用或细节呈现。`
    ], ""),
    environment: context.scene,
    lighting: "干净真实的商业光线，日常实用氛围，材质有自然高光，不要夸张奇幻氛围。",
    camera: "稳定中景开场，缓慢推进或轻微手持移动，靠近展示商品可见结构、佩戴/使用方式和已核验细节，最后用干净的商品聚焦画面收尾。",
    visualStyle: "真实 TikTok Shop 电商短视频，商品身份清晰，动作自然，背景简单，并为平台 UI 留出空间。"
  };
}

function joinPromptSentences(parts: string[], separator: string): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(separator);
}

function shouldIncludeUserIntentInActionSlot(userIntent: string): boolean {
  const normalized = userIntent.trim().replace(/[。！？.!?]+$/g, "").trim();
  if (!normalized) return false;
  if (/^(日常使用场景商品短视频|daily-use product short video|daily use product short video)$/i.test(normalized)) {
    return false;
  }
  return true;
}

function buildVideoFlow(input: {
  durationSeconds: number;
  userIntent: string;
  product: ProductFacts;
  locale: AppLocale;
}): string[] {
  const ranges = videoTimeRanges(input.durationSeconds);
  const primaryPoint = input.product.verified_selling_points[0] ?? "the main product benefit";
  const secondaryPoint = input.product.verified_selling_points[1] ?? "visible product details";
  const scene = input.product.usage_scenes[0] ?? "daily use";
  const userIntentSentence = sentence(input.userIntent, input.locale);
  if (input.locale === "en") {
    return [
      `${ranges[0]}: Start with the product already visible in a ${scene} context that matches the user's intent: ${userIntentSentence}`,
      `${ranges[1]}: Show the product being used naturally, with a clear view of its real shape, fit, and handling.`,
      `${ranges[2]}: Move closer to show ${primaryPoint} and ${secondaryPoint} through visible product details and hand movement.`,
      `${ranges[3]}: End on a clean product-focused shot that shows the full use effect and leaves space for platform UI.`
    ];
  }
  return [
    `${ranges[0]}: 商品一开始就清晰可见，放在「${scene}」语境中，并贴合用户意图：${userIntentSentence}`,
    `${ranges[1]}: 自然展示商品使用方式，让真实形状、贴合方式和手部操作清楚可见。`,
    `${ranges[2]}: 镜头靠近，通过可见细节和手部动作表现「${primaryPoint}」与「${secondaryPoint}」。`,
    `${ranges[3]}: 用干净的商品聚焦画面收尾，展示完整使用效果，并为平台 UI 留出空间。`
  ];
}

function videoProductIdentity(product: ProductFacts, locale: AppLocale): string {
  const category = usefulFactValue(product.category);
  const materials = product.materials.map(usefulFactValue).filter(Boolean);
  const dimensions = usefulFactValue(product.dimensions);
  const confirmedDetails = [...materials, dimensions].filter(Boolean);

  if (locale === "en") {
    const parts = [
      category ? `product type ${category}` : "",
      confirmedDetails.length > 0 ? `verified material/spec details ${confirmedDetails.join(", ")}` : ""
    ].filter(Boolean);
    return parts.length > 0
      ? parts.join("; ")
      : "product identity comes from the selected references and verified facts";
  }

  const parts = [
    category ? `参考商品类型为${category}` : "",
    confirmedDetails.length > 0 ? `已确认材质/规格仅作外观约束：${confirmedDetails.join("、")}` : ""
  ].filter(Boolean);
  return parts.length > 0
    ? parts.join("；")
    : "商品身份以已选参考图和已核验事实为准";
}

function usefulFactValue(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  if (/(未确认|未確認|待确认|待確認|不明|不详|不詳|未填写|未填|unknown|not confirmed|tbd|n\/a|none|null)/i.test(trimmed)) {
    return "";
  }
  return trimmed;
}

function videoSceneFromProduct(product: ProductFacts, locale: AppLocale): string {
  const scenes = product.usage_scenes.map((item) => item.trim()).filter(Boolean);
  if (scenes.length > 0) {
    return locale === "en"
      ? `realistic ecommerce lifestyle environment based on these usage contexts: ${scenes.join(", ")}.`
      : `基于这些使用语境的真实电商生活方式环境：${scenes.join("、")}。`;
  }
  return locale === "en"
    ? "clean ecommerce lifestyle environment focused on the product and practical daily use."
    : "干净电商生活方式环境，聚焦商品和日常实用性。";
}

function videoTimeRanges(durationSeconds: number): string[] {
  const duration = clampDuration(durationSeconds);
  const firstEnd = Math.max(1, Math.min(2, Math.floor(duration * 0.2)));
  const secondEnd = Math.max(firstEnd + 1, Math.min(duration - 2, Math.floor(duration * 0.5)));
  const thirdEnd = Math.max(secondEnd + 1, Math.min(duration - 1, Math.floor(duration * 0.8)));
  return [
    `0-${firstEnd}s`,
    `${firstEnd}-${secondEnd}s`,
    `${secondEnd}-${thirdEnd}s`,
    `${thirdEnd}-${duration}s`
  ];
}

function imageCompositionForIntent(userIntent: string, locale: AppLocale): string {
  if (/白底|white background|main image|主图/i.test(userIntent)) {
    if (locale === "zh") {
      return "使用干净浅色或白色背景，商品居中，真实电商布光，边缘清晰，并保留足够裁切留白。";
    }
    return "Use a clean light or white background, centered product composition, realistic ecommerce lighting, sharp product edges, and enough negative space for marketplace cropping.";
  }
  if (/场景|scene|lifestyle|通勤|户外|骑车/i.test(userIntent)) {
    if (locale === "zh") {
      return "使用真实生活方式场景，商品作为明确主体，呈现实用使用状态、自然光和干净商业构图。";
    }
    return "Use a realistic lifestyle scene, keep the product as the clear subject, show practical use, natural light, and clean commercial composition.";
  }
  if (/细节|detail|texture|材质|指孔/i.test(userIntent)) {
    if (locale === "zh") {
      return "使用商品细节近景，突出材质纹理、结构、边缘、开孔和可见功能细节。";
    }
    return "Use a close product detail composition that highlights material texture, structure, edges, openings, and visible functional details.";
  }
  if (locale === "zh") {
    return "使用干净商业商品构图，主体明确，光线真实，材质细节准确，背景干扰少。";
  }
  return "Use a clean commercial product composition with clear subject, realistic lighting, accurate material detail, and minimal background distraction.";
}

function videoSceneForIntent(input: ProductPromptCompileInput, locale: AppLocale): string {
  const userIntent = normalizedUserPrompt(input.userPrompt, "");
  const scenes = input.product.usage_scenes.join(", ");
  if (/通勤|骑车|cycling|commut/i.test(userIntent)) {
    if (locale === "zh") {
      return "日本夏季通勤和骑车场景，氛围轻盈、透气、实用，适合日常户外使用。";
    }
    return "A summer commuting and cycling scene in Japan. The mood should feel light, breathable, practical, and suitable for daily outdoor use.";
  }
  if (/开箱|unbox/i.test(userIntent)) {
    if (locale === "zh") {
      return "干净桌面开箱场景，始终保持商品可见，并快速进入实用商品细节。";
    }
    return "A clean tabletop unboxing scene that keeps the product visible and moves quickly into practical product details.";
  }
  if (/UGC|用户|手持|first person/i.test(userIntent)) {
    if (locale === "zh") {
      return "自然用户拍摄风格，手持构图、真实使用动作和实用电商语气。";
    }
    return "A natural user-shot style scene with hand-held framing, real use gestures, and a practical ecommerce tone.";
  }
  if (locale === "zh") {
    return scenes
      ? `基于这些使用语境的真实电商生活方式场景：${scenes}。`
      : "干净电商生活方式场景，聚焦商品和日常实用性。";
  }
  return scenes
    ? `A realistic ecommerce lifestyle scene based on these usage contexts: ${scenes}.`
    : "A clean ecommerce lifestyle scene focused on the product and its practical daily use.";
}

function normalizedUserPrompt(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }
  return originalUserIntentFromCompiledPrompt(trimmed) ?? trimmed;
}

function originalUserIntentFromCompiledPrompt(prompt: string): string | undefined {
  if (!isCompiledProductPrompt(prompt)) {
    return undefined;
  }
  return extractLabeledLine(prompt, "创作目标：", "。")
    ?? extractLabeledLine(prompt, "Creative goal: ", ".")
    ?? extractLabeledLine(prompt, "用户意图：", "。")
    ?? extractLabeledLine(prompt, "User intent: ", ".");
}

function isCompiledProductPrompt(prompt: string): boolean {
  return (
    (prompt.includes("目标图片模型：") || prompt.includes("目标视频模型：") || prompt.includes("Target image model:") || prompt.includes("Target video model:")) &&
    (prompt.includes("创作目标：") || prompt.includes("Creative goal: ") || prompt.includes("用户意图：") || prompt.includes("User intent: "))
  );
}

function extractLabeledLine(prompt: string, label: string, trailingPunctuation: string): string | undefined {
  const line = prompt.split("\n").find((item) => item.trimStart().startsWith(label));
  if (!line) {
    return undefined;
  }
  return stripTrailingPunctuation(line.trim().slice(label.length).trim(), trailingPunctuation);
}

function stripTrailingPunctuation(value: string, punctuation: string): string {
  let next = value.trim();
  while (next.endsWith(punctuation)) {
    next = next.slice(0, -punctuation.length).trimEnd();
  }
  return next || value.trim();
}

function sentence(value: string, locale: AppLocale): string {
  const trimmed = value.trim();
  const punctuationPattern = locale === "en" ? /[.!?]+$/ : /[。！？.!?]+$/;
  const body = trimmed.replace(punctuationPattern, "");
  return `${body}${locale === "en" ? "." : "。"}`;
}

function normalizeReferences(referenceImages: string[] | undefined): string[] {
  return (referenceImages ?? [])
    .map((reference) => reference.trim())
    .filter(Boolean);
}

function mergedForbiddenClaims(product: ProductFacts, extra: string[]): string[] {
  const seen = new Set<string>();
  return [...product.forbidden_claims, ...extra]
    .map((claim) => claim.trim())
    .filter((claim) => {
      if (!claim || seen.has(claim.toLowerCase())) {
        return false;
      }
      seen.add(claim.toLowerCase());
      return true;
    });
}

function bulletLines(lines: string[]): string[] {
  const normalized = lines.map((line) => line.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized.map((line) => `- ${line}`) : ["- none"];
}

function clampDuration(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed)) {
    return 10;
  }
  return Math.max(4, Math.min(15, parsed));
}

function modelLabel(targetModel: ProductPromptTargetModel): string {
  return [
    targetModel.providerId,
    targetModel.vendor,
    targetModel.model
  ].map((part) => part?.trim()).filter(Boolean).join(" / ");
}
