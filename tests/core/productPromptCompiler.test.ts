import { describe, expect, it } from "vitest";

import type { ProductFacts } from "../../src/core/productFacts.js";
import { compileProductPrompt } from "../../src/core/productPromptCompiler.js";

const product: ProductFacts = {
  sku: "ARM-COVER-001",
  title_ja: "接触冷感アームカバー",
  category: "运动袖套",
  materials: ["聚酯纤维"],
  dimensions: "约 42cm 长",
  verified_selling_points: [
    "轻薄透气",
    "覆盖手臂和手背",
    "拇指开孔设计",
    "适合通勤、骑车、户外"
  ],
  usage_scenes: ["通勤", "骑车", "户外"],
  forbidden_claims: ["UV 防晒率未确认", "医疗级防护未确认", "销量第一未确认"],
  reference_images: ["reference-01.jpg", "reference-03.jpg"]
};

describe("compileProductPrompt", () => {
  it("compiles a Seedance video prompt from product facts, selected references, and user intent", () => {
    const result = compileProductPrompt({
      mode: "video",
      product,
      userPrompt: "做一个日本 TikTok 10 秒视频，通勤骑车场景，突出夏天手臂不闷、好穿。",
      referenceImages: ["reference-01.jpg", "reference-03.jpg"],
      targetModel: {
        providerId: "volcengine-seedance",
        model: "seedance-2.0-fast"
      },
      video: {
        durationSeconds: 10,
        aspectRatio: "9:16",
        finalLanguage: "ja"
      }
    });

    expect(result.recipeId).toBe("seedance-video@v2");
    expect(result.prompt).toContain("生成 10 秒 9:16 竖版 TikTok Shop 商品视频");
    expect(result.prompt).toContain("目标视频模型：volcengine-seedance");
    expect(result.prompt).toContain("只使用这些已选择的参考图作为商品视觉约束");
    expect(result.prompt).toContain("reference-01.jpg, reference-03.jpg");
    expect(result.prompt).toContain("视频提示词：");
    expect(result.prompt).toContain("真实 TikTok Shop 商品短视频");
    expect(result.prompt).toContain("商品以已选参考图为准");
    expect(result.prompt).toContain("动作：");
    expect(result.prompt).toContain("环境：");
    expect(result.prompt).toContain("光线与氛围：");
    expect(result.prompt).toContain("镜头运动：");
    expect(result.prompt).toContain("视觉风格：");
    expect(result.prompt).toContain("质量与限制：");
    expect(result.prompt).toContain("轻薄透气");
    expect(result.prompt).toContain("拇指开孔设计");
    expect(result.prompt).toContain("禁止：");
    expect(result.prompt).toContain("UV 防晒率未确认");
    expect(result.prompt).toContain("医疗级防护");
    expect(result.prompt).not.toContain("商品标题：");
    expect(result.prompt).not.toContain("类目：");
    expect(result.prompt).not.toContain("材质：");
    expect(result.prompt).not.toContain("尺寸/重量：");
    expect(result.prompt).not.toContain("用户意图：");
    expect(result.prompt).not.toContain("主题：真实商品");
    expect(result.prompt).not.toContain(product.title_ja);
    expect(result.prompt).toContain("最终视频语言：日文");
    expect(result.notes).toContain("已按 seedance-video@v2 编译为视频模型提示词。");
  });

  it("compiles an image prompt without video timeline language", () => {
    const result = compileProductPrompt({
      mode: "image",
      product,
      userPrompt: "白底主图，高级一点，突出轻薄透气和指孔。",
      referenceImages: ["reference-03.jpg"],
      targetModel: {
        providerId: "openai-compatible-image",
        model: "gpt-image-1"
      }
    });

    expect(result.recipeId).toBe("commercial-image@v1");
    expect(result.prompt).toContain("生成一张真实商品的干净电商商品图");
    expect(result.prompt).toContain("目标图片模型：openai-compatible-image");
    expect(result.prompt).toContain("reference-03.jpg");
    expect(result.prompt).toContain("保持真实商品外观、形状、颜色、材质纹理、比例和可见细节");
    expect(result.prompt).toContain("画面构图：");
    expect(result.prompt).toContain("白底主图");
    expect(result.prompt).toContain("轻薄透气");
    expect(result.prompt).toContain("不要添加文字覆盖");
    expect(result.prompt).not.toContain("视频提示词：");
    expect(result.prompt).not.toContain("0-2s:");
    expect(result.notes).toContain("已按 commercial-image@v1 编译为图片模型提示词。");
  });

  it("keeps English prompt compiler output for English pages", () => {
    const videoResult = compileProductPrompt({
      locale: "en",
      mode: "video",
      product,
      userPrompt: "Make a Japanese TikTok commuting cycling video.",
      referenceImages: ["reference-01.jpg"],
      targetModel: {
        providerId: "volcengine-seedance",
        model: "seedance-2.0-fast"
      },
      video: {
        durationSeconds: 10,
        aspectRatio: "9:16",
        finalLanguage: "ja"
      }
    });
    const imageResult = compileProductPrompt({
      locale: "en",
      mode: "image",
      product,
      userPrompt: "White background hero image.",
      referenceImages: ["reference-03.jpg"],
      targetModel: {
        providerId: "openai-compatible-image",
        model: "gpt-image-1"
      }
    });

    expect(videoResult.prompt).toContain("Create a 10-second vertical 9:16 TikTok Shop product video");
    expect(videoResult.prompt).toContain("Video prompt:");
    expect(videoResult.prompt).not.toContain("生成 10 秒");
    expect(videoResult.recipeId).toBe("seedance-video@v2");
    expect(videoResult.prompt).toContain("Real TikTok Shop product video");
    expect(videoResult.prompt).toContain("Use the selected reference images as the product appearance source");
    expect(videoResult.prompt).toContain("Action:");
    expect(videoResult.prompt).toContain("Environment:");
    expect(videoResult.prompt).toContain("Lighting and mood:");
    expect(videoResult.prompt).toContain("Camera movement:");
    expect(videoResult.prompt).toContain("Visual style:");
    expect(videoResult.prompt).toContain("Quality and restrictions:");
    expect(videoResult.prompt).not.toContain("Product title:");
    expect(videoResult.prompt).not.toContain("User intent:");
    expect(videoResult.prompt).not.toContain("Subject: a real product");
    expect(videoResult.notes).toContain("Compiled video model prompt with seedance-video@v2.");
    expect(imageResult.prompt).toContain("Create a clean ecommerce product image");
    expect(imageResult.prompt).toContain("Composition:");
    expect(imageResult.prompt).not.toContain("生成一张真实商品");
    expect(imageResult.notes).toContain("Compiled image model prompt with commercial-image@v1.");
  });

  it("keeps prompt preview idempotent when the compiled prompt is previewed again", () => {
    const firstVideo = compileProductPrompt({
      mode: "video",
      product,
      userPrompt: "做日本 TikTok 通勤骑车视频，突出轻薄透气。",
      referenceImages: ["reference-01.jpg"],
      targetModel: {
        providerId: "volcengine-seedance",
        model: "seedance-2.0-fast"
      },
      video: {
        durationSeconds: 10,
        aspectRatio: "9:16",
        finalLanguage: "ja"
      }
    });
    const secondVideo = compileProductPrompt({
      mode: "video",
      product,
      userPrompt: firstVideo.prompt,
      referenceImages: ["reference-01.jpg"],
      targetModel: {
        providerId: "volcengine-seedance",
        model: "seedance-2.0-fast"
      },
      video: {
        durationSeconds: 10,
        aspectRatio: "9:16",
        finalLanguage: "ja"
      }
    });
    const firstImage = compileProductPrompt({
      mode: "image",
      product,
      userPrompt: "白底主图，高级一点，突出轻薄透气和指孔。",
      referenceImages: ["reference-03.jpg"],
      targetModel: {
        providerId: "openai-compatible-image",
        model: "gpt-image-1"
      }
    });
    const secondImage = compileProductPrompt({
      mode: "image",
      product,
      userPrompt: firstImage.prompt,
      referenceImages: ["reference-03.jpg"],
      targetModel: {
        providerId: "openai-compatible-image",
        model: "gpt-image-1"
      }
    });

    expect(secondVideo.prompt).toBe(firstVideo.prompt);
    expect(secondImage.prompt).toBe(firstImage.prompt);
  });

  it("uses a human default intent instead of a template id when no video prompt is provided", () => {
    const result = compileProductPrompt({
      mode: "video",
      product,
      referenceImages: ["reference-01.jpg"],
      targetModel: {
        providerId: "volcengine-seedance",
        model: "seedance-2.0-fast"
      },
      video: {
        durationSeconds: 10,
        aspectRatio: "9:16",
        finalLanguage: "ja"
      }
    });

    expect(result.prompt).toContain("动作：10 秒内商品始终清晰可见，自然展示拿取、佩戴、使用或细节呈现。");
    expect(result.prompt).not.toContain("动作：日常使用场景商品短视频。");
    expect(result.prompt).not.toContain("用户意图：scene");
    expect(result.prompt).not.toContain("0-2s:");
  });

  it("does not force color variants into the camera movement slot", () => {
    const result = compileProductPrompt({
      mode: "video",
      product: {
        ...product,
        verified_selling_points: ["ブラック", "カーキ", "キャラメル", "クリームのバリエーション"]
      },
      referenceImages: ["reference-01.jpg", "reference-02.jpg"],
      targetModel: {
        providerId: "volcengine-seedance",
        model: "seedance-2.0-fast"
      },
      video: {
        durationSeconds: 10,
        aspectRatio: "9:16",
        finalLanguage: "ja"
      }
    });

    expect(result.prompt).toContain("镜头运动：稳定中景开场，缓慢推进或轻微手持移动，靠近展示商品可见结构、佩戴/使用方式和已核验细节");
    expect(result.prompt).toContain("- ブラック");
    expect(result.prompt).toContain("- カーキ");
    expect(result.prompt).not.toContain("靠近展示「ブラック」和「カーキ」");
  });

  it("does not inject long marketing titles into video prompts as factual claims", () => {
    const marketingTitleProduct: ProductFacts = {
      ...product,
      title_ja: "UVカット 日よけ帽子 2026夏新作 レディースニットバケットハット 通気性抜群 メッシュ編みデザイン 薄手 軽量 紫外線対策 小顔効果 SNS人気",
      category: "スポーツ・アウトドア用帽子",
      materials: ["材质未确认"],
      dimensions: "尺寸未确认",
      verified_selling_points: ["ブラック", "カーキ", "キャラメル", "クリームのバリエーション"],
      usage_scenes: ["通勤", "屋外での移動", "スポーツ"],
      forbidden_claims: ["UVカット率は未確認", "小顔効果は未確認", "SNS人気は未確認"]
    };

    const result = compileProductPrompt({
      mode: "video",
      product: marketingTitleProduct,
      userPrompt: "日常使用场景商品短视频。",
      referenceImages: ["refs/reference-01.jpg"],
      targetModel: {
        providerId: "volcengine-seedance",
        model: "doubao-seedance-2-0-fast-260128"
      },
      video: {
        durationSeconds: 10,
        aspectRatio: "9:16",
        finalLanguage: "ja"
      }
    });

    expect(result.prompt).toContain("商品以已选参考图为准");
    expect(result.prompt).toContain("スポーツ・アウトドア用帽子");
    expect(result.prompt).toContain("创作目标：日常使用场景商品短视频。");
    expect(result.prompt).toContain("- ブラック");
    expect(result.prompt).toContain("- カーキ");
    expect(result.prompt).toContain("UVカット率は未確認");
    expect(result.prompt).not.toContain("动作：真实用户自然拿起、佩戴或使用商品。日常使用场景商品短视频。");
    expect(result.prompt).not.toContain(marketingTitleProduct.title_ja);
    expect(result.prompt).not.toContain("材质未确认");
    expect(result.prompt).not.toContain("尺寸未确认");
    expect(result.prompt).not.toContain("商品标题：");
    expect(result.prompt).not.toContain("材质：");
    expect(result.prompt).not.toContain("尺寸/重量：");
  });

  it("varies Seedance prompt slots by selected shooting style", () => {
    const lifestyle = compileProductPrompt({
      mode: "video",
      product,
      userPrompt: "做得生活化一点",
      referenceImages: ["reference-01.jpg"],
      targetModel: {
        providerId: "volcengine-seedance",
        model: "seedance-2.0-fast"
      },
      video: {
        durationSeconds: 10,
        aspectRatio: "9:16",
        finalLanguage: "ja",
        creativeStyle: "lifestyle"
      }
    });
    const benefit = compileProductPrompt({
      mode: "video",
      product,
      userPrompt: "突出卖点",
      referenceImages: ["reference-01.jpg"],
      targetModel: {
        providerId: "volcengine-seedance",
        model: "seedance-2.0-fast"
      },
      video: {
        durationSeconds: 10,
        aspectRatio: "9:16",
        finalLanguage: "ja",
        creativeStyle: "benefit"
      }
    });

    expect(lifestyle.prompt).toContain("动作：真实用户自然拿起、佩戴或使用商品");
    expect(lifestyle.prompt).toContain("视觉风格：真实 TikTok 日常种草风");
    expect(benefit.prompt).toContain("动作：围绕已核验卖点展示商品");
    expect(benefit.prompt).toContain("视觉风格：清晰直接的电商广告展示风");
    expect(benefit.prompt).not.toContain("真实 TikTok 日常种草风");
  });

  it("can follow the user prompt to infer shooting style", () => {
    const result = compileProductPrompt({
      mode: "video",
      product,
      userPrompt: "用真实用户手持 UGC 风格展示，别太广告。",
      referenceImages: ["reference-01.jpg"],
      targetModel: {
        providerId: "volcengine-seedance",
        model: "seedance-2.0-fast"
      },
      video: {
        durationSeconds: 10,
        aspectRatio: "9:16",
        finalLanguage: "ja",
        creativeStyle: "auto"
      }
    });

    expect(result.prompt).toContain("动作：像真实用户拿起、佩戴、试用或展示商品");
    expect(result.prompt).toContain("视觉风格：真实 UGC 用户分享风");
  });
});
