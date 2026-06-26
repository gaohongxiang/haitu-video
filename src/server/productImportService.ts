import { ZodError } from "zod";

import {
  buildProductImportQuality,
  cleanImportedProductText,
  type ImportedProductPreview
} from "../core/productImportCleaner.js";
import { parseProductFacts } from "../core/productFacts.js";
import type { TextProvider } from "../providers/textProviderTypes.js";
import { runMeteredAiAction } from "./aiBilling.js";
import type { DatabaseHandle } from "./db/client.js";
import type { ModelStoredConfig } from "./modelConfigStore.js";
import { normalizeAiProductFacts } from "./productImportAiNormalization.js";
import { saveProductFactPackage } from "./productService.js";
import type { WalletStore } from "./walletStore.js";

export {
  buildProductFileImportPreview,
  commitProductFileImportRows,
  type ImportProductFileCommitRequest,
  type ImportProductFilePreviewRequest
} from "./productFileImportService.js";

export interface ImportProductPreviewRequest {
  text?: string;
  textModelConfigId?: string;
}

export interface ImportProductsBatchRequest {
  text?: string;
}

export type ProductImportTextModelProviderFactory = (input: {
  textModelConfigId?: string;
}) => Promise<{
  provider: TextProvider;
  config: Partial<ModelStoredConfig>;
}>;

type SavedProduct = Awaited<ReturnType<typeof saveProductFactPackage>>;

type ProductImportBatchResult =
  | {
      index: number;
      status: "imported";
      product: SavedProduct;
      notes: string[];
    }
  | {
      index: number;
      status: "failed";
      error: string;
    };

export function buildImportedProductPreview(input: ImportProductPreviewRequest): ImportedProductPreview {
  const text = String(input.text ?? "").trim();
  if (!text) {
    throw new Error("Product import requires source text.");
  }
  const preview = cleanImportedProductText(text);
  return {
    ...preview,
    product: {
      ...preview.product,
      source_text: text
    }
  };
}

export async function buildAiImportedProductPreview(input: {
  walletStore: WalletStore;
  createTextModelProvider: ProductImportTextModelProviderFactory;
  input: ImportProductPreviewRequest;
}): Promise<ImportedProductPreview> {
  const text = String(input.input.text ?? "").trim();
  if (!text) {
    throw new Error("Product import requires source text.");
  }
  const textModel = await input.createTextModelProvider({
    textModelConfigId: input.input.textModelConfigId
  });
  try {
    const rawProduct = await runMeteredAiAction({
      walletStore: input.walletStore,
      kind: "text",
      modelConfig: textModel.config,
      reserveDescription: "AI 资料整理预扣",
      chargeDescription: "AI 资料整理扣费",
      action: () => textModel.provider.generateJson<unknown>({
        system: [
          "你是电商商品资料整理助手。",
          "只输出 JSON object，不要 markdown。",
          "把用户粘贴的商品资料整理成以下字段：sku, title_ja, category, materials, dimensions, verified_selling_points, usage_scenes, forbidden_claims, reference_images。",
          "sku 可以从原文 SKU/商品番号/ID 提取；没有时生成一个稳定简短的 ITEM- 前缀内部编号。",
          "只把可确认事实放入 verified_selling_points；普通商品功能词（如 接触冷感、通気性、紫外線対策、日焼け対策）如果原文有，不要放入 forbidden_claims。",
          "forbidden_claims 只放高风险或明确未证明宣称：销量/排名/No.1、医用/治疗、防水/耐荷重、UV 具体数值、永久/完全等绝对化宣称。",
          "价格、店铺名、物流信息不要写入商品资料。"
        ].join("\n"),
        user: [
          "请整理这段商品资料：",
          text
        ].join("\n\n")
      })
    });
    const product = parseProductFacts(normalizeAiProductFacts(rawProduct, text));
    return {
      product,
      notes: ["文本模型已整理商品资料。"],
      quality: buildProductImportQuality({
        product,
        riskyClaims: product.forbidden_claims
      })
    };
  } catch (error) {
    if (!shouldFallbackToLocalProductImport(error)) {
      throw error;
    }
    const fallback = buildImportedProductPreview({ text });
    return {
      ...fallback,
      notes: [
        "AI 整理返回格式异常，已改用本地规则整理资料。",
        ...fallback.notes
      ]
    };
  }
}

export async function importProductFromText(input: {
  fixturesDir: string;
  rootDir: string;
  workspaceId?: string;
  databaseHandle?: DatabaseHandle;
  fetchImpl?: typeof fetch;
  input: ImportProductPreviewRequest;
}): Promise<{ product: SavedProduct; notes: string[] }> {
  const preview = buildImportedProductPreview(input.input);
  return {
    product: await saveProductFactPackage({
      fixturesDir: input.fixturesDir,
      rootDir: input.rootDir,
      workspaceId: input.workspaceId,
      databaseHandle: input.databaseHandle,
      fetchImpl: input.fetchImpl,
      input: preview.product
    }),
    notes: preview.notes
  };
}

export async function importProductsBatchFromText(input: {
  fixturesDir: string;
  rootDir: string;
  workspaceId?: string;
  databaseHandle?: DatabaseHandle;
  fetchImpl?: typeof fetch;
  input: ImportProductsBatchRequest;
}): Promise<{
  summary: {
    total: number;
    imported: number;
    failed: number;
  };
  results: ProductImportBatchResult[];
}> {
  const blocks = splitImportedProductBlocks(String(input.input.text ?? ""));
  if (blocks.length === 0) {
    throw new Error("Product batch import requires source text.");
  }
  const results: ProductImportBatchResult[] = [];
  for (const [blockIndex, block] of blocks.entries()) {
    try {
      const imported = await importProductFromText({
        fixturesDir: input.fixturesDir,
        rootDir: input.rootDir,
        workspaceId: input.workspaceId,
        databaseHandle: input.databaseHandle,
        fetchImpl: input.fetchImpl,
        input: { text: block }
      });
      results.push({
        index: blockIndex + 1,
        status: "imported",
        product: imported.product,
        notes: imported.notes
      });
    } catch (error) {
      results.push({
        index: blockIndex + 1,
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  const imported = results.filter((item) => item.status === "imported").length;
  return {
    summary: {
      total: results.length,
      imported,
      failed: results.length - imported
    },
    results
  };
}

function shouldFallbackToLocalProductImport(error: unknown): boolean {
  if (error instanceof ZodError) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("文本模型返回内容不是 JSON") ||
    message.includes("Unexpected token") ||
    message.includes("Unexpected end of JSON input");
}

function splitImportedProductBlocks(text: string): string[] {
  return text
    .trim()
    .split(/\n\s*(?:---+|={3,})\s*\n|\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}
