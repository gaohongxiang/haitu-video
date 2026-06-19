import ExcelJS from "exceljs";

import { cleanImportedProductText, type ProductImportQuality } from "./productImportCleaner.js";
import type { ProductFacts } from "./productFacts.js";

export type ProductFileImportRowStatus = "ready" | "needs-ai" | "needs-input" | "duplicate" | "failed";

export interface ProductFileImportPreview {
  fileName: string;
  sheetName?: string;
  summary: ProductFileImportSummary;
  diagnostics: ProductFileImportDiagnostics;
  rows: ProductFileImportRow[];
}

export type ProductFileImportDiagnosticsReason = "empty" | "sku-only" | "no-product-fields";

export interface ProductFileImportDiagnostics {
  scannedRows: number;
  candidateRows: number;
  skippedRows: number;
  headers: string[];
  reason?: ProductFileImportDiagnosticsReason;
  message?: string;
}

export interface ProductFileImportSummary {
  total: number;
  ready: number;
  needsAi: number;
  needsInput: number;
  duplicateSku: number;
  failed: number;
}

export interface ProductFileImportRow {
  rowId: string;
  rowNumber: number;
  sourceRowNumbers: number[];
  status: ProductFileImportRowStatus;
  raw: Record<string, string>;
  sourceText: string;
  notes: string[];
  warnings: string[];
  duplicate: boolean;
  referenceImageCount: number;
  product?: ProductFacts;
  quality: ProductImportQuality;
  error?: string;
}

export interface ParseProductImportFileInput {
  fileName: string;
  mimeType?: string;
  bytes: Uint8Array | Buffer;
  existingSkus?: string[];
}

interface ParsedTable {
  sheetName?: string;
  rows: ParsedTableRow[];
  diagnostics: ProductFileImportDiagnostics;
}

interface ParsedTableRow {
  rowNumber: number;
  raw: Record<string, string>;
}

interface ProductTableGroup {
  rowNumber: number;
  sourceRowNumbers: number[];
  raw: Record<string, string>;
}

interface CsvReadState {
  rows: string[][];
  row: string[];
  cell: string;
  inQuotes: boolean;
}

const emptyQuality: ProductImportQuality = {
  ready: false,
  score: 0,
  summary: "无法解析商品资料。",
  missingFields: ["标题"],
  verifiedFacts: [],
  blockedClaims: [],
  warnings: ["请检查文件表头和商品行内容。"]
};

const productIdHeaderPatterns = [
  /^(商品ID|商品id|产品ID|產品ID|产品id|產品id|全球产品ID|全球產品ID|global\s*product\s*id|product\s*id|id)$/i
];
const titleHeaderPatterns = [
  /^(商品名|商品名称|商品名稱|商品标题|商品標題|商品タイトル|产品名称|產品名稱|产品标题|產品標題|标题|標題|title)$/i
];
const categoryHeaderPatterns = [
  /^(分类id|分類id|分类ID|分類ID|分类|分類|类目|類目|カテゴリ|カテゴリー|category|产品类目|產品類目|产品类别|產品類別)$/i
];
const materialHeaderPatterns = [
  /^(素材|材质|材質|材料|materials?|产品材质|產品材質)$/i
];
const dimensionHeaderPatterns = [
  /^(尺寸|尺寸\/重量|重量|サイズ|dimensions?)$/i
];
const weightHeaderPatterns = [
  /^(重量\(kg\)|重量kg|重量|包装重量|包裝重量|包裹重量|weight(?:\s*\(kg\))?)$/i
];
const packageSizeHeaderPatterns = [
  /^(包裹尺寸|包装尺寸|包裝尺寸|package\s*dimensions?)$/i
];
const lengthHeaderPatterns = [
  /^(长|長|长度|長度|包装长度|包裝長度|length)$/i
];
const widthHeaderPatterns = [
  /^(宽|寬|宽度|寬度|包装宽度|包裝寬度|width)$/i
];
const heightHeaderPatterns = [
  /^(高|高度|包装高度|包裝高度|height)$/i
];
const usageHeaderPatterns = [
  /^(使用场景|使用場景|シーン|场景|場景|usage|scene)$/i
];
const descriptionHeaderPatterns = [
  /^(详情|詳情|描述|商品描述|商品説明|说明|說明|description|tiktok产品描述|tiktok產品描述|产品描述|產品描述)$/i
];
const productAttributeHeaderPatterns = [
  /^(产品属性|產品屬性|商品属性|商品屬性|属性|屬性|attributes?)$/i
];
const shopHeaderPatterns = [
  /^(店铺名|店鋪名|店铺名称|店鋪名稱|店铺|店鋪|店舗|shop)$/i
];
const priceHeaderPatterns = [
  /^(販売価格|售价|价格|價格|価格|price|税前价格|稅前價格|本地展示价|本地展示價|价格\(站点币种\)|價格\(站點幣種\))$/i
];
const variantValueHeaderPatterns = [
  /^(规格|規格|颜色|顏色|色|カラー|变种属性值一|變種屬性值一|变种属性值二|變種屬性值二|变种属性值三|變種屬性值三|variant\s*value.*)$/i
];
const skuHeaderPatterns = [
  /^(SKU|商品SKU|商品编码|商品編碼|商品番号|品番|货号|貨號|平台SKU)$/i
];

const headerAliases: Array<[RegExp, string]> = [
  [/^(sku|SKU|商品SKU|商品编码|商品編碼|商品番号|品番|货号|貨號)$/i, "SKU"],
  [/^(商品ID|商品id|产品ID|產品ID|产品id|產品id|全球产品ID|全球產品ID|product\s*id|global\s*product\s*id|id|ID)$/i, "商品ID"],
  [/^(商品名|商品名称|商品名稱|商品标题|商品標題|商品タイトル|产品名称|產品名稱|产品标题|產品標題|标题|標題|title)$/i, "商品名"],
  [/^(分类id|分類id|分类|分類|类目|類目|カテゴリ|カテゴリー|category|产品类目|產品類目|产品类别|產品類別)$/i, "カテゴリ"],
  [/^(素材|材质|材質|材料|materials?)$/i, "素材"],
  [/^(尺寸|尺寸\/重量|重量|サイズ|dimensions?)$/i, "サイズ"],
  [/^(卖点|賣點|販売ポイント|特徴|特长|特長|selling\s*points?)$/i, "卖点"],
  [/^(使用场景|使用場景|シーン|场景|場景|usage|scene)$/i, "使用场景"],
  [/^(禁止|禁用|不可用卖点|不可用賣點|未确认宣称|未確認宣称|forbidden)$/i, "禁止"],
  [/^(主图|主圖|主图\(url\)地址|主圖\(url\)地址|SKU图片url|SKU圖片url|产品主图url|產品主圖url|图片|圖片|画像|参考图|参考圖|详情图|詳情圖|附图.*|附圖.*|图片链接|圖片鏈接|图片地址|image\s*urls?|images?)$/i, "图片"],
  [/^(详情|詳情|描述|商品描述|商品説明|说明|說明|description|tiktok产品描述|tiktok產品描述|产品描述|產品描述)$/i, "商品説明"]
];

export async function parseProductImportFile(input: ParseProductImportFileInput): Promise<ProductFileImportPreview> {
  const parsed = await parseTable(input);
  const existingSkus = new Set((input.existingSkus ?? []).map((sku) => sku.trim().toLowerCase()).filter(Boolean));
  const groups = groupProductRows(parsed.rows);
  const rows = groups.map((group, index) => buildPreviewRow({
    raw: group.raw,
    rowNumber: group.rowNumber,
    sourceRowNumbers: group.sourceRowNumbers,
    rowIndex: index,
    existingSkus
  }));
  return {
    fileName: input.fileName,
    sheetName: parsed.sheetName,
    summary: summarizeRows(rows),
    diagnostics: {
      ...parsed.diagnostics,
      candidateRows: parsed.rows.length,
      skippedRows: Math.max(0, parsed.diagnostics.scannedRows - parsed.rows.length)
    },
    rows
  };
}

export function selectedFileImportRows(rows: ProductFileImportRow[], rowIds: string[]): ProductFileImportRow[] {
  const selected = new Set(rowIds);
  return rows.filter((row) =>
    selected.has(row.rowId) &&
    Boolean(row.product) &&
    row.status !== "failed" &&
    row.status !== "needs-input" &&
    row.status !== "duplicate"
  );
}

async function parseTable(input: ParseProductImportFileInput): Promise<ParsedTable> {
  if (isWorkbookFile(input.fileName, input.mimeType)) {
    return parseWorkbookTable(input.bytes, input.fileName);
  }
  return parseCsvTable(Buffer.from(input.bytes).toString("utf8"));
}

async function parseWorkbookTable(bytes: Uint8Array | Buffer, fileName: string): Promise<ParsedTable> {
  if (!fileName.toLowerCase().endsWith(".xlsx")) {
    throw new Error("Excel 文件导入目前支持 .xlsx，请将 .xls 另存为 CSV 或 XLSX 后再导入。");
  }
  const workbook = new ExcelJS.Workbook();
  const workbookBuffer = Buffer.from(bytes);
  const workbookArrayBuffer = workbookBuffer.buffer.slice(
    workbookBuffer.byteOffset,
    workbookBuffer.byteOffset + workbookBuffer.byteLength
  );
  await workbook.xlsx.load(workbookArrayBuffer as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return emptyParsedTable("Sheet1");
  }
  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const rowValues = Array.isArray(row.values) ? row.values.slice(1) : [];
    matrix.push(rowValues.map((cell) => formatExcelCell(cell)));
  });
  return rowsFromMatrix(matrix, sheet.name);
}

function parseCsvTable(text: string): ParsedTable {
  return rowsFromMatrix(parseCsvRows(stripUtf8Bom(text)));
}

function formatExcelCell(cell: unknown): string {
  if (cell instanceof Date) {
    return cell.toISOString().slice(0, 10);
  }
  if (cell === null || cell === undefined) {
    return "";
  }
  if (typeof cell === "object") {
    const record = cell as Record<string, unknown>;
    if (typeof record.text === "string") {
      return record.text;
    }
    if (Array.isArray(record.richText)) {
      return record.richText
        .map((part) => typeof part === "object" && part && "text" in part ? String((part as { text: unknown }).text ?? "") : "")
        .join("");
    }
    if ("result" in record) {
      return formatExcelCell(record.result);
    }
    if ("hyperlink" in record) {
      return formatExcelCell(record.hyperlink);
    }
  }
  return String(cell);
}

function rowsFromMatrix(matrix: string[][], sheetName?: string): ParsedTable {
  const headerIndex = matrix.findIndex((row) => row.some((cell) => String(cell ?? "").trim()));
  if (headerIndex < 0) {
    return emptyParsedTable(sheetName);
  }
  const headers = matrix[headerIndex]!.map((cell, index) => String(cell ?? "").trim() || `列${index + 1}`);
  let scannedRows = 0;
  const rows = matrix.slice(headerIndex + 1).flatMap((row, index) => {
    const raw: Record<string, string> = {};
    for (const [cellIndex, header] of headers.entries()) {
      const value = String(row[cellIndex] ?? "").trim();
      if (value) {
        raw[header] = value;
      }
    }
    if (Object.keys(raw).length === 0) {
      return [];
    }
    scannedRows += 1;
    if (!isCandidateProductRow(raw)) {
      return [];
    }
    return [{
      rowNumber: headerIndex + index + 2,
      raw
    }];
  });
  const diagnostics = buildTableDiagnostics({
    headers,
    scannedRows,
    candidateRows: rows.length
  });
  return { sheetName, rows, diagnostics };
}

function emptyParsedTable(sheetName?: string): ParsedTable {
  return {
    sheetName,
    rows: [],
    diagnostics: {
      scannedRows: 0,
      candidateRows: 0,
      skippedRows: 0,
      headers: [],
      reason: "empty",
      message: "文件里没有读取到表头或数据行。请确认导出的是 CSV 或 XLSX 商品资料文件。"
    }
  };
}

function buildTableDiagnostics(input: {
  headers: string[];
  scannedRows: number;
  candidateRows: number;
}): ProductFileImportDiagnostics {
  const skippedRows = Math.max(0, input.scannedRows - input.candidateRows);
  const reason = input.candidateRows > 0
    ? undefined
    : tableDiagnosticsReason(input.headers, input.scannedRows);
  return {
    scannedRows: input.scannedRows,
    candidateRows: input.candidateRows,
    skippedRows,
    headers: input.headers,
    reason,
    message: productFileImportDiagnosticMessage({
      ...input,
      skippedRows,
      reason
    })
  };
}

function tableDiagnosticsReason(headers: string[], scannedRows: number): ProductFileImportDiagnosticsReason | undefined {
  if (scannedRows === 0) {
    return "empty";
  }
  if (looksLikeSkuOnlyExport(headers)) {
    return "sku-only";
  }
  return "no-product-fields";
}

function productFileImportDiagnosticMessage(input: {
  scannedRows: number;
  candidateRows: number;
  skippedRows: number;
  headers: string[];
  reason?: ProductFileImportDiagnosticsReason;
}): string | undefined {
  if (!input.reason) {
    return undefined;
  }
  if (input.reason === "empty") {
    return "文件里没有读取到可解析的数据行。请确认导出的是 CSV 或 XLSX 商品资料文件。";
  }
  if (input.reason === "sku-only") {
    return `检测到 ${input.scannedRows} 行 SKU 明细，但这个文件不是商品资料导出，缺少商品标题、产品 ID、描述或图片字段。请从妙手/店小秘导出商品列表或产品资料后再导入。`;
  }
  return `读取到 ${input.scannedRows} 行数据，但没有识别到商品资料字段。请确认表头包含商品标题、产品 ID、描述或图片地址。`;
}

function looksLikeSkuOnlyExport(headers: string[]): boolean {
  const normalizedHeaders = headers.map((header) => header.trim()).filter(Boolean);
  if (normalizedHeaders.some((header) => hasProductHeaderMeaning(header))) {
    return false;
  }
  return normalizedHeaders.some((header) =>
    /^(SKU\s*ID|SKU|平台SKU|商品SKU|商品编码|商品編碼|货号|貨號)$/i.test(header) ||
    /^关联货源/.test(header) ||
    /^關聯貨源/.test(header)
  );
}

function hasProductHeaderMeaning(header: string): boolean {
  return [
    productIdHeaderPatterns,
    titleHeaderPatterns,
    categoryHeaderPatterns,
    materialHeaderPatterns,
    dimensionHeaderPatterns,
    descriptionHeaderPatterns,
    productAttributeHeaderPatterns
  ].some((patterns) => patterns.some((pattern) => pattern.test(header.trim()))) || isImageHeader(header);
}

function buildPreviewRow(input: {
  raw: Record<string, string>;
  rowNumber: number;
  sourceRowNumbers: number[];
  rowIndex: number;
  existingSkus: Set<string>;
}): ProductFileImportRow {
  const sourceText = rowToSourceText(input.raw);
  const rowId = `row-${input.rowNumber}-${input.rowIndex + 1}`;
  try {
    const preview = cleanImportedProductText(sourceText);
    const duplicate = input.existingSkus.has(preview.product.sku.trim().toLowerCase());
    const status = rowStatus(preview.quality, duplicate);
    return {
      rowId,
      rowNumber: input.rowNumber,
      sourceRowNumbers: input.sourceRowNumbers,
      status,
      raw: input.raw,
      sourceText,
      notes: preview.notes,
      warnings: preview.quality.warnings,
      duplicate,
      referenceImageCount: preview.product.reference_images.length,
      product: {
        ...preview.product,
        source_text: sourceText
      },
      quality: preview.quality
    };
  } catch (error) {
    return {
      rowId,
      rowNumber: input.rowNumber,
      sourceRowNumbers: input.sourceRowNumbers,
      status: "failed",
      raw: input.raw,
      sourceText,
      notes: [],
      warnings: ["请检查该行是否包含商品标题、SKU 或商品描述。"],
      duplicate: false,
      referenceImageCount: 0,
      quality: emptyQuality,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function groupProductRows(rows: ParsedTableRow[]): ProductTableGroup[] {
  const groups: Array<{ key: string; rows: ParsedTableRow[] }> = [];
  const indexByKey = new Map<string, number>();
  for (const row of rows) {
    const key = productGroupKey(row) ?? `row:${row.rowNumber}`;
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, groups.length);
      groups.push({ key, rows: [row] });
    } else {
      groups[existingIndex]!.rows.push(row);
    }
  }
  return groups.map((group) => {
    const firstRow = group.rows[0]!;
    return {
      rowNumber: firstRow.rowNumber,
      sourceRowNumbers: group.rows.map((row) => row.rowNumber),
      raw: mergeProductRows(group.rows)
    };
  });
}

function productGroupKey(row: ParsedTableRow): string | undefined {
  const productId = firstRawValue(row.raw, productIdHeaderPatterns);
  if (productId) {
    return `id:${normalizeGroupKey(productId)}`;
  }
  const title = firstRawValue(row.raw, titleHeaderPatterns);
  if (title) {
    return `title:${normalizeGroupKey(title)}`;
  }
  return undefined;
}

function mergeProductRows(rows: ParsedTableRow[]): Record<string, string> {
  const first = rows[0]?.raw ?? {};
  const productId = firstValueAcrossRows(rows, productIdHeaderPatterns);
  const title = firstValueAcrossRows(rows, titleHeaderPatterns);
  const category = firstValueAcrossRows(rows, categoryHeaderPatterns);
  const material = firstValueAcrossRows(rows, materialHeaderPatterns) ??
    firstExtractedAttributeAcrossRows(rows, ["材质", "材質", "素材", "材料", "梱包材", "material"]);
  const dimensions = packageDimensionsAcrossRows(rows) ??
    firstValueAcrossRows(rows, dimensionHeaderPatterns) ??
    firstExtractedAttributeAcrossRows(rows, ["尺寸", "サイズ", "重量", "容量", "size", "dimension"]);
  const usage = firstValueAcrossRows(rows, usageHeaderPatterns);
  const shop = firstValueAcrossRows(rows, shopHeaderPatterns);
  const price = firstValueAcrossRows(rows, priceHeaderPatterns);
  const sku = productId ? undefined : productLevelSku(rows, title, category);
  const variantValues = uniqueNonEmpty(rows.flatMap((row) => allRawValues(row.raw, variantValueHeaderPatterns)));
  const imageReferences = uniqueNonEmpty(rows.flatMap((row) => collectRowImageReferences(row.raw)));
  const descriptions = uniqueNonEmpty(rows.flatMap((row) => allRawValues(row.raw, descriptionHeaderPatterns)));
  const sellingPoints = uniqueNonEmpty([
    ...rows.flatMap((row) => allRawValues(row.raw, [/^(卖点|賣點|販売ポイント|特徴|特长|特長|selling\s*points?)$/i])),
    variantValues.length > 1 ? `${variantValues.join("、")}のバリエーション` : ""
  ]);

  const merged: Record<string, string> = {};
  if (sku) merged["SKU"] = sku;
  if (productId) merged["商品ID"] = productId;
  if (title) merged["商品名"] = title;
  if (category) merged["カテゴリ"] = category;
  if (material) merged["素材"] = material;
  if (dimensions) merged["サイズ"] = dimensions;
  if (variantValues.length > 0) {
    merged["规格选项"] = variantValues.join("、");
    if (variantValues.some((value) => /色|カラー|black|white|red|blue|green|ブラウン|ベージュ|ブラック|ホワイト|グレー|カーキ|ピンク|クリーム/i.test(value))) {
      merged["颜色"] = variantValues.join("、");
    }
  }
  if (sellingPoints.length > 0) merged["卖点"] = sellingPoints.join("、");
  if (usage) merged["使用场景"] = usage;
  if (shop) merged["店铺名"] = shop;
  if (price) merged["价格"] = price;
  if (descriptions.length > 0) merged["商品説明"] = descriptions.join("\n");
  if (imageReferences.length > 0) merged["图片"] = imageReferences.join("、");

  if (Object.keys(merged).length > 0) {
    return merged;
  }
  return first;
}

function productLevelSku(rows: ParsedTableRow[], title?: string, category?: string): string | undefined {
  const explicitSku = firstValueAcrossRows(rows, skuHeaderPatterns);
  if (explicitSku && rows.length === 1) {
    return explicitSku;
  }
  const categoryPrefix = category ? `${asciiSlug(category).slice(0, 16)}-` : "";
  const titleSlug = asciiSlug(title ?? "").slice(0, 18);
  const generated = `${categoryPrefix}${titleSlug}`.replace(/-+/g, "-");
  return `MS-${generated || String(rows[0]?.rowNumber ?? Date.now())}`;
}

function firstValueAcrossRows(rows: ParsedTableRow[], patterns: RegExp[]): string | undefined {
  for (const row of rows) {
    const value = firstRawValue(row.raw, patterns);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function firstExtractedAttributeAcrossRows(rows: ParsedTableRow[], labels: string[]): string | undefined {
  for (const row of rows) {
    for (const value of allRawValues(row.raw, productAttributeHeaderPatterns)) {
      const extracted = extractAttributeValue(value, labels);
      if (extracted) {
        return extracted;
      }
    }
  }
  return undefined;
}

function packageDimensionsAcrossRows(rows: ParsedTableRow[]): string | undefined {
  const weight = firstValueAcrossRows(rows, weightHeaderPatterns);
  const packageSize = firstValueAcrossRows(rows, packageSizeHeaderPatterns);
  const length = firstValueAcrossRows(rows, lengthHeaderPatterns);
  const width = firstValueAcrossRows(rows, widthHeaderPatterns);
  const height = firstValueAcrossRows(rows, heightHeaderPatterns);
  const parts: string[] = [];
  if (weight) {
    parts.push(`重量 ${appendUnit(weight, "kg")}`);
  }
  if (length && width && height) {
    parts.push(`${length}x${width}x${height}cm`);
  } else if (packageSize) {
    parts.push(normalizePackageSize(packageSize));
  }
  return parts.length > 0 ? parts.join(" / ") : undefined;
}

function normalizePackageSize(value: string): string {
  const trimmed = value.trim();
  const length = trimmed.match(/(?:长|長|长度|長度)\s*[:：]?\s*([\d.]+)/i)?.[1];
  const width = trimmed.match(/(?:宽|寬|宽度|寬度)\s*[:：]?\s*([\d.]+)/i)?.[1];
  const height = trimmed.match(/(?:高|高度)\s*[:：]?\s*([\d.]+)/i)?.[1];
  if (length && width && height) {
    return `${length}x${width}x${height}cm`;
  }
  return trimmed;
}

function appendUnit(value: string, unit: string): string {
  const trimmed = value.trim();
  return new RegExp(`${escapeRegExp(unit)}$`, "i").test(trimmed) ? trimmed : `${trimmed}${unit}`;
}

function firstRawValue(raw: Record<string, string>, patterns: RegExp[]): string | undefined {
  return allRawValues(raw, patterns)[0];
}

function allRawValues(raw: Record<string, string>, patterns: RegExp[]): string[] {
  const values: string[] = [];
  for (const [header, value] of Object.entries(raw)) {
    if (patterns.some((pattern) => pattern.test(header.trim())) && value.trim()) {
      values.push(value.trim());
    }
  }
  return values;
}

function collectRowImageReferences(raw: Record<string, string>): string[] {
  const imageValues: string[] = [];
  const descriptionValues: string[] = [];
  for (const [header, value] of Object.entries(raw)) {
    if (isImageHeader(header)) {
      imageValues.push(...splitLooseImageReferences(value));
      imageValues.push(...extractLooseUrls(value));
    }
    if (descriptionHeaderPatterns.some((pattern) => pattern.test(header.trim()))) {
      descriptionValues.push(...extractHtmlImageUrls(value));
    }
  }
  return uniqueImageReferences([...imageValues, ...descriptionValues]);
}

function isImageHeader(header: string): boolean {
  const normalized = header.trim();
  return /图|圖|画像|image|img/i.test(normalized) &&
    /(url|地址|链接|鏈接|图|圖|画像|image|img)/i.test(normalized);
}

function splitLooseImageReferences(value: string): string[] {
  return value
    .split(/\s*(?:、|,|，|;|；|\n)\s*/)
    .map((item) => stripHtmlImageTag(item.trim()))
    .filter((item) => /^https?:\/\//i.test(item));
}

function extractHtmlImageUrls(value: string): string[] {
  const urls: string[] = [];
  for (const match of value.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)["']?[^>]*>/gi)) {
    if (match[1]) {
      urls.push(match[1].trim());
    }
  }
  return urls;
}

function extractLooseUrls(value: string): string[] {
  return Array.from(value.matchAll(/https?:\/\/[^\s"'<>、，,；;)）]+/gi))
    .map((match) => match[0]?.replace(/[.。]+$/, "").trim() ?? "")
    .filter(Boolean);
}

function stripHtmlImageTag(value: string): string {
  const match = value.match(/<img\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)["']?[^>]*>/i);
  return match?.[1]?.trim() ?? value;
}

function extractAttributeValue(value: string, labels: string[]): string | undefined {
  const parsed = parseJsonMaybe(value);
  const fromJson = parsed ? findAttributeValue(parsed, labels) : undefined;
  if (fromJson) {
    return fromJson;
  }
  for (const label of labels) {
    const escaped = escapeRegExp(label);
    const match = value.match(new RegExp(`${escaped}\\s*[:：=]?\\s*([^,，;；\\]\\}\\n]+)`, "i"));
    if (match?.[1]?.trim()) {
      return match[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  return undefined;
}

function parseJsonMaybe(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function findAttributeValue(node: unknown, labels: string[]): string | undefined {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findAttributeValue(item, labels);
      if (found) return found;
    }
    return undefined;
  }
  if (!node || typeof node !== "object") {
    return undefined;
  }
  const record = node as Record<string, unknown>;
  const attributeName = stringValue(record.attributeName ?? record.name ?? record.label);
  if (attributeName && labels.some((label) => attributeName.toLowerCase().includes(label.toLowerCase()))) {
    const values = record.values;
    if (Array.isArray(values)) {
      const first = values
        .map((value) => stringValue((value as Record<string, unknown>)?.valueName ?? (value as Record<string, unknown>)?.name ?? value))
        .find(Boolean);
      if (first) return first;
    }
    const value = stringValue(record.valueName ?? record.value);
    if (value) return value;
  }
  for (const value of Object.values(record)) {
    const found = findAttributeValue(value, labels);
    if (found) return found;
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeGroupKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function asciiSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 32);
}

function uniqueNonEmpty(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function uniqueImageReferences(items: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const item of items.map((value) => value.trim()).filter(Boolean)) {
    const key = imageReferenceKey(item);
    const existing = byKey.get(key);
    if (!existing || imageReferenceScore(item) > imageReferenceScore(existing)) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values());
}

function imageReferenceKey(value: string): string {
  try {
    const url = new URL(value);
    const tiktokImageId = url.pathname.match(/\/([^/?]+)~tplv-[^/?]+?\.(?:jpe?g|png|webp)/i)?.[1];
    if (tiktokImageId) {
      return `${url.host}/${tiktokImageId}`;
    }
    url.search = "";
    url.hash = "";
    return url.toString().replace(/~tplv-[^/?]+(?=\.(?:jpe?g|png|webp))/i, "");
  } catch {
    return value.replace(/[?#].*$/, "");
  }
}

function imageReferenceScore(value: string): number {
  let score = 0;
  if (/origin/i.test(value)) score += 10;
  if (!/resize/i.test(value)) score += 2;
  return score;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rowStatus(quality: ProductImportQuality, duplicate: boolean): ProductFileImportRowStatus {
  if (duplicate) {
    return "duplicate";
  }
  if (quality.ready) {
    return "ready";
  }
  if (quality.missingFields.includes("标题")) {
    return "needs-input";
  }
  return "needs-ai";
}

function summarizeRows(rows: ProductFileImportRow[]): ProductFileImportSummary {
  return {
    total: rows.length,
    ready: rows.filter((row) => row.status === "ready").length,
    needsAi: rows.filter((row) => row.status === "needs-ai").length,
    needsInput: rows.filter((row) => row.status === "needs-input").length,
    duplicateSku: rows.filter((row) => row.status === "duplicate").length,
    failed: rows.filter((row) => row.status === "failed").length
  };
}

function rowToSourceText(raw: Record<string, string>): string {
  const lines = Object.entries(raw)
    .map(([header, value]) => {
      const normalized = normalizeImportLabel(header);
      if (normalized === "商品説明") {
        return `${normalized}：\n${value}`;
      }
      return `${normalized}：${value}`;
    })
    .filter((line) => line.trim());
  return lines.join("\n");
}

function normalizeImportLabel(header: string): string {
  for (const [pattern, normalized] of headerAliases) {
    if (pattern.test(header)) {
      return normalized;
    }
  }
  return header;
}

function isCandidateProductRow(raw: Record<string, string>): boolean {
  const values = Object.values(raw).map((value) => value.trim()).filter(Boolean);
  if (values.length === 0) {
    return false;
  }
  const combinedHeaders = Object.keys(raw).map(normalizeImportLabel).join(" ");
  if (/合计|合計|total|小计|小計/i.test(values.join(" ")) && values.length <= 2) {
    return false;
  }
  const hasProductIdentity = Boolean(firstRawValue(raw, productIdHeaderPatterns) || firstRawValue(raw, titleHeaderPatterns));
  const hasProductContent = Boolean(
    firstRawValue(raw, categoryHeaderPatterns) ||
    firstRawValue(raw, materialHeaderPatterns) ||
    firstRawValue(raw, dimensionHeaderPatterns) ||
    firstRawValue(raw, descriptionHeaderPatterns) ||
    firstRawValue(raw, productAttributeHeaderPatterns) ||
    collectRowImageReferences(raw).length > 0
  );
  return hasProductIdentity || hasProductContent;
}

function isWorkbookFile(fileName: string, mimeType?: string): boolean {
  const lowerName = fileName.toLowerCase();
  const lowerMime = (mimeType ?? "").toLowerCase();
  if (lowerName.endsWith(".csv")) {
    return false;
  }
  return lowerName.endsWith(".xlsx") ||
    lowerName.endsWith(".xls") ||
    lowerMime.includes("spreadsheet") ||
    lowerMime.includes("excel");
}

function parseCsvRows(text: string): string[][] {
  const state: CsvReadState = {
    rows: [],
    row: [],
    cell: "",
    inQuotes: false
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\"") {
      if (state.inQuotes && text[index + 1] === "\"") {
        state.cell += "\"";
        index += 1;
      } else {
        state.inQuotes = !state.inQuotes;
      }
      continue;
    }
    if (char === "," && !state.inQuotes) {
      pushCsvCell(state);
      continue;
    }
    if ((char === "\n" || char === "\r") && !state.inQuotes) {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      pushCsvCell(state);
      pushCsvRow(state);
      continue;
    }
    state.cell += char;
  }
  pushCsvCell(state);
  pushCsvRow(state);
  return state.rows;
}

function pushCsvCell(state: CsvReadState): void {
  state.row.push(state.cell);
  state.cell = "";
}

function pushCsvRow(state: CsvReadState): void {
  if (state.row.some((cell) => cell.trim())) {
    state.rows.push(state.row);
  }
  state.row = [];
}

function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
