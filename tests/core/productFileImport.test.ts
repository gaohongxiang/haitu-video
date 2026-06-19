import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";

import {
  parseProductImportFile,
  selectedFileImportRows
} from "../../src/core/productFileImport.js";

const sampleXlsxBase64 = "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";

function makeInlineStringXlsx(rows: string[][], dimensionRef = "A1"): Buffer {
  const worksheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const cellRef = `${excelColumnName(columnIndex)}${rowIndex + 1}`;
      return `<c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${dimensionRef}"/>
  <sheetData>${worksheetRows}</sheetData>
</worksheet>`)
  };
  return Buffer.from(zipSync(files));
}

function excelColumnName(columnIndex: number): string {
  let name = "";
  let value = columnIndex + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

describe("parseProductImportFile", () => {
  it("groups Dianxiaomi SKU rows by product id into one import preview", async () => {
    const csv = [
      "SKU ID,关联货源链接,产品ID,全球产品ID,产品名称,店铺名称,品牌,产品类目,平台SKU,规格,税前价格,本地展示价,库存,SKU图片url,产品主图url",
      "1735937433973458476,,17359373939,17359373939,UVカット 日よけアームカバー,LUMI LIFE,无品牌,スポーツ・アウトドア,17350727158,ブラック,2700,2700,100,https://cdn.example.test/sku-black.jpg,https://cdn.example.test/main-arm.jpg",
      "1735937433973524012,,17359373939,17359373939,UVカット 日よけアームカバー,LUMI LIFE,无品牌,スポーツ・アウトドア,17350727158,カーキ,2700,2700,100,https://cdn.example.test/sku-khaki.jpg,https://cdn.example.test/main-arm.jpg",
      "1735937368064099884,,17359374275,17359374275,折りたたみエコバッグ,LUMI LIFE,无品牌,バッグ・スーツケース,17352472858,ブラック,3100,3100,100,https://cdn.example.test/bag-black.jpg,https://cdn.example.test/main-bag.jpg"
    ].join("\n");

    const preview = await parseProductImportFile({
      fileName: "店小秘导出.csv",
      mimeType: "text/csv",
      bytes: Buffer.from(csv, "utf8"),
      existingSkus: []
    });

    expect(preview.summary.total).toBe(2);
    expect(preview.rows.map((row) => ({
      rowNumber: row.rowNumber,
      sourceRowNumbers: row.sourceRowNumbers,
      sku: row.product?.sku,
      title: row.product?.title_ja,
      imageCount: row.referenceImageCount,
      sourceText: row.sourceText
    }))).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        sourceRowNumbers: [2, 3],
        sku: "DXM-17359373939",
        title: "UVカット 日よけアームカバー",
        imageCount: 3
      }),
      expect.objectContaining({
        rowNumber: 4,
        sourceRowNumbers: [4],
        sku: "DXM-17359374275",
        title: "折りたたみエコバッグ",
        imageCount: 2
      })
    ]);
    expect(preview.rows[0]?.sourceText).toContain("规格选项：ブラック、カーキ");
    expect(preview.rows[0]?.sourceText).not.toContain("ブラック、カーキのバリエーション");
    expect(preview.rows[0]?.sourceText).toContain("来源行：2、3");
    expect(preview.rows[0]?.sourceText).toContain("SKU数：2");
    expect(preview.rows[0]?.product?.reference_images).toEqual([
      "https://cdn.example.test/sku-black.jpg",
      "https://cdn.example.test/main-arm.jpg",
      "https://cdn.example.test/sku-khaki.jpg"
    ]);
  });

  it("groups Miaoshou variant rows by category id and product title without treating each sku as a product", async () => {
    const csv = [
      "分类id,产品标题,Tiktok产品描述,品牌,产品属性,sku,变种属性名称一,变种属性值一,价格(站点币种),本地展示价,库存,主图(url)地址,附图一,附图二",
      "601445,NOMA- 自立型バッグインバッグ 大容量トート整理ポーチ 旅行用,<img src=\"https://cdn.example.test/desc-1.jpg\">,NOMA,材质: ポリエステル,173517732471703302,色,ブラウン（個別包装）,4642,4642,100,https://cdn.example.test/main.jpg,https://cdn.example.test/sub-1.jpg,https://cdn.example.test/sub-2.jpg",
      "601445,NOMA- 自立型バッグインバッグ 大容量トート整理ポーチ 旅行用,<img src=\"https://cdn.example.test/desc-2.jpg\">,NOMA,材质: ポリエステル,173517732471768838,色,ベージュ（個別包装）,4642,4642,100,https://cdn.example.test/main.jpg,https://cdn.example.test/sub-3.jpg,https://cdn.example.test/sub-4.jpg"
    ].join("\n");

    const preview = await parseProductImportFile({
      fileName: "妙手导出.csv",
      mimeType: "text/csv",
      bytes: Buffer.from(csv, "utf8"),
      existingSkus: []
    });

    expect(preview.summary.total).toBe(1);
    expect(preview.rows[0]).toEqual(expect.objectContaining({
      rowNumber: 2,
      sourceRowNumbers: [2, 3],
      status: "needs-ai",
      referenceImageCount: 7
    }));
    expect(preview.rows[0]?.product).toEqual(expect.objectContaining({
      sku: "MS-601445-NOMA-",
      title_ja: "NOMA- 自立型バッグインバッグ 大容量トート整理ポーチ 旅行用",
      category: "601445",
      materials: ["ポリエステル"],
      reference_images: [
        "https://cdn.example.test/main.jpg",
        "https://cdn.example.test/sub-1.jpg",
        "https://cdn.example.test/sub-2.jpg",
        "https://cdn.example.test/desc-1.jpg",
        "https://cdn.example.test/sub-3.jpg",
        "https://cdn.example.test/sub-4.jpg",
        "https://cdn.example.test/desc-2.jpg"
      ]
    }));
    expect(preview.rows[0]?.sourceText).toContain("规格选项：ブラウン（個別包装）、ベージュ（個別包装）");
  });

  it("parses multiple CSV product rows into selectable import previews", async () => {
    const csv = [
      "SKU,商品名,カテゴリ,素材,サイズ,卖点,使用场景,主图",
      "ARM-001,接触冷感アームカバー,アームカバー,ポリエステル,約52cm,通気性のある生地,通勤,https://cdn.example.test/arm-main.jpg",
      "WALLET-001,ラウンドファスナー ミニ財布,財布,PUレザー,約11x9x3cm,カードを整理しやすい,買い物,https://cdn.example.test/wallet-main.webp"
    ].join("\n");

    const preview = await parseProductImportFile({
      fileName: "products.csv",
      mimeType: "text/csv",
      bytes: Buffer.from(csv, "utf8"),
      existingSkus: []
    });

    expect(preview.summary).toEqual({
      total: 2,
      ready: 2,
      needsAi: 0,
      needsInput: 0,
      duplicateSku: 0,
      failed: 0
    });
    expect(preview.rows.map((row) => ({
      rowNumber: row.rowNumber,
      status: row.status,
      sku: row.product?.sku,
      title: row.product?.title_ja,
      imageCount: row.referenceImageCount
    }))).toEqual([
      {
        rowNumber: 2,
        status: "ready",
        sku: "ARM-001",
        title: "接触冷感アームカバー",
        imageCount: 1
      },
      {
        rowNumber: 3,
        status: "ready",
        sku: "WALLET-001",
        title: "ラウンドファスナー ミニ財布",
        imageCount: 1
      }
    ]);
    expect(preview.rows[0]?.product?.reference_images).toEqual(["https://cdn.example.test/arm-main.jpg"]);
    expect(preview.rows[0]?.raw).toMatchObject({
      SKU: "ARM-001",
      商品名: "接触冷感アームカバー",
      カテゴリ: "アームカバー",
      素材: "ポリエステル",
      サイズ: "約52cm",
      "卖点": "通気性のある生地",
      "使用场景": "通勤",
      图片: "https://cdn.example.test/arm-main.jpg"
    });
  });

  it("treats .csv files as CSV even when browsers report an Excel MIME type", async () => {
    const csv = [
      "SKU,商品名,カテゴリ,素材,サイズ,卖点,使用场景,主图",
      "ARM-001,接触冷感アームカバー,アームカバー,ポリエステル,約52cm,通気性のある生地,通勤,https://cdn.example.test/arm-main.jpg"
    ].join("\n");

    const preview = await parseProductImportFile({
      fileName: "店小秘导出.csv",
      mimeType: "application/vnd.ms-excel",
      bytes: Buffer.from(csv, "utf8"),
      existingSkus: []
    });

    expect(preview.rows[0]?.product?.sku).toBe("ARM-001");
    expect(preview.rows[0]?.status).toBe("ready");
  });

  it("parses XLSX exports and marks existing SKU rows as duplicates", async () => {
    const preview = await parseProductImportFile({
      fileName: "妙手导出.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: Buffer.from(sampleXlsxBase64, "base64"),
      existingSkus: ["DXM-172397"]
    });

    expect(preview.rows).toHaveLength(2);
    expect(preview.rows[0]).toEqual(expect.objectContaining({
      rowNumber: 2,
      status: "duplicate",
      duplicate: true,
      referenceImageCount: 1
    }));
    expect(preview.rows[0]?.product).toEqual(expect.objectContaining({
      sku: "DXM-172397",
      title_ja: "接触冷感アームカバー 指穴付き",
      category: "アームカバー",
      forbidden_claims: ["完全防水は証明未確認"],
      reference_images: ["https://cdn.example.test/arm-main.png"]
    }));
    expect(preview.rows[1]).toEqual(expect.objectContaining({
      status: "needs-ai",
      referenceImageCount: 0
    }));
    expect(preview.rows[1]?.quality.missingFields).toEqual(expect.arrayContaining(["材质", "尺寸/重量", "参考图"]));
    expect(preview.summary).toEqual({
      total: 2,
      ready: 0,
      needsAi: 1,
      needsInput: 0,
      duplicateSku: 1,
      failed: 0
    });
  });

  it("parses Dianxiaomi XLSX exports with a broken A1 worksheet dimension and groups SKU rows by product id", async () => {
    const bytes = makeInlineStringXlsx([
      [
        "分类id",
        "产品标题",
        "Tiktok产品描述",
        "产品属性",
        "sku",
        "变种属性名称一",
        "变种属性值一",
        "价格(站点币种)",
        "主图(url)地址",
        "附图一",
        "变种主题1图片",
        "重量(kg)",
        "长",
        "宽",
        "高",
        "店铺名",
        "产品id"
      ],
      [
        "601445",
        "NOMA- 自立型バッグインバッグ 大容量トート整理ポーチ 旅行用",
        "<img src=\"https://cdn.example.test/desc-1.jpg\">",
        "[{\"attributeName\":\"材質\",\"values\":[{\"valueName\":\"ポリエステル\"}]}]",
        "1735157732471703302",
        "色",
        "ブラウン (個別包装)",
        "4642",
        "https://cdn.example.test/main.jpg",
        "https://cdn.example.test/sub-1.jpg",
        "https://cdn.example.test/variant-brown.jpg",
        "0.35",
        "35",
        "25",
        "8",
        "NOMA_JP",
        "1735646830185580227"
      ],
      [
        "601445",
        "NOMA- 自立型バッグインバッグ 大容量トート整理ポーチ 旅行用",
        "<img src=\"https://cdn.example.test/desc-2.jpg\">",
        "[{\"attributeName\":\"材質\",\"values\":[{\"valueName\":\"ポリエステル\"}]}]",
        "1735157732471768838",
        "色",
        "ベージュ (個別包装)",
        "4642",
        "https://cdn.example.test/main.jpg",
        "https://cdn.example.test/sub-1.jpg",
        "https://cdn.example.test/variant-beige.jpg",
        "0.35",
        "35",
        "25",
        "8",
        "NOMA_JP",
        "1735646830185580227"
      ]
    ]);

    const preview = await parseProductImportFile({
      fileName: "tiktok_chanpin.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes,
      existingSkus: []
    });

    expect(preview.summary.total).toBe(1);
    expect(preview.rows[0]).toEqual(expect.objectContaining({
      rowNumber: 2,
      sourceRowNumbers: [2, 3],
      referenceImageCount: 6
    }));
    expect(preview.rows[0]?.product).toEqual(expect.objectContaining({
      sku: "DXM-1735646830185580227",
      title_ja: "NOMA- 自立型バッグインバッグ 大容量トート整理ポーチ 旅行用",
      category: "601445",
      materials: ["ポリエステル"],
      dimensions: "重量 0.35kg / 35x25x8cm",
      reference_images: [
        "https://cdn.example.test/main.jpg",
        "https://cdn.example.test/sub-1.jpg",
        "https://cdn.example.test/variant-brown.jpg",
        "https://cdn.example.test/desc-1.jpg",
        "https://cdn.example.test/variant-beige.jpg",
        "https://cdn.example.test/desc-2.jpg"
      ]
    }));
    expect(preview.rows[0]?.sourceText).toContain("规格选项：ブラウン (個別包装)、ベージュ (個別包装)");
  });

  it("does not treat Miaoshou SKU-only exports as product rows", async () => {
    const bytes = makeInlineStringXlsx([
      ["SKU ID", "关联货源链接", "关联货源ID", "关联货源价格"],
      ["1735730948790388268", "", "", ""],
      ["1735730948790453804", "", "", ""]
    ], "A1:D3");

    const preview = await parseProductImportFile({
      fileName: "导出#SKU.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes,
      existingSkus: []
    });

    expect(preview.rows).toEqual([]);
    expect(preview.diagnostics).toEqual(expect.objectContaining({
      scannedRows: 2,
      candidateRows: 0,
      skippedRows: 2,
      reason: "sku-only",
      headers: ["SKU ID", "关联货源链接", "关联货源ID", "关联货源价格"]
    }));
    expect(preview.diagnostics.message).toContain("检测到 2 行 SKU 明细");
    expect(preview.diagnostics.message).toContain("不是商品资料导出");
    expect(preview.summary).toEqual({
      total: 0,
      ready: 0,
      needsAi: 0,
      needsInput: 0,
      duplicateSku: 0,
      failed: 0
    });
  });

  it("groups Miaoshou SKU exports with product id fields into product previews", async () => {
    const bytes = makeInlineStringXlsx([
      [
        "SKU ID",
        "关联货源链接",
        "关联货源ID",
        "关联货源价格",
        "产品ID",
        "全球产品ID",
        "产品名称",
        "站点",
        "店铺ID",
        "店铺名称",
        "品牌",
        "产品类目",
        "平台SKU",
        "规格",
        "税前价格",
        "本地展示价",
        "库存",
        "SKU图片url",
        "产品主图url",
        "包裹重量",
        "包裹尺寸"
      ],
      [
        "1735937433973392940",
        "",
        "",
        "",
        "1735937393965499948",
        "1735937393965565484",
        "UVカット 日よけ帽子",
        "日本",
        "16273125",
        "LUMI LIFE",
        "无品牌",
        "スポーツ・アウトドア>スポーツ・アウトドアアクセサリー>スポーツ・アウトドア用帽子>",
        "1735072715857823462",
        "ブラック",
        "2700",
        "2700",
        "100",
        "https://cdn.example.test/hat-black.jpg",
        "https://cdn.example.test/hat-main-1.jpg,https://cdn.example.test/hat-main-2.jpg",
        "0.1",
        "长：10,宽：5, 高：5"
      ],
      [
        "1735937433973458476",
        "",
        "",
        "",
        "1735937393965499948",
        "1735937393965565484",
        "UVカット 日よけ帽子",
        "日本",
        "16273125",
        "LUMI LIFE",
        "无品牌",
        "スポーツ・アウトドア>スポーツ・アウトドアアクセサリー>スポーツ・アウトドア用帽子>",
        "1735072715857823462",
        "カーキ",
        "2700",
        "2700",
        "100",
        "https://cdn.example.test/hat-khaki.jpg",
        "https://cdn.example.test/hat-main-1.jpg,https://cdn.example.test/hat-main-2.jpg",
        "0.1",
        "长：10,宽：5, 高：5"
      ],
      [
        "1735937368064099884",
        "",
        "",
        "",
        "1735937427580945964",
        "1735937427581011500",
        "折りたたみエコバッグ",
        "日本",
        "16273125",
        "LUMI LIFE",
        "无品牌",
        "バッグ・スーツケース>バッグ・トラベル用品>トラベルオーガナイザー>",
        "1735247285814527718",
        "ブラック",
        "3100",
        "3100",
        "100",
        "https://cdn.example.test/bag-black.jpg",
        "https://cdn.example.test/bag-main.jpg",
        "0.2",
        "长：10,宽：10, 高：10"
      ]
    ], "A1:U4");

    const preview = await parseProductImportFile({
      fileName: "导出#SKU.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes,
      existingSkus: []
    });

    expect(preview.summary.total).toBe(2);
    expect(preview.diagnostics).toEqual(expect.objectContaining({
      scannedRows: 3,
      candidateRows: 3,
      skippedRows: 0,
      reason: undefined
    }));
    expect(preview.rows[0]).toEqual(expect.objectContaining({
      rowNumber: 2,
      sourceRowNumbers: [2, 3],
      referenceImageCount: 4
    }));
    expect(preview.rows[0]?.product).toEqual(expect.objectContaining({
      sku: "DXM-1735937393965499948",
      title_ja: "UVカット 日よけ帽子",
      category: "スポーツ・アウトドア用帽子",
      dimensions: "重量 0.1kg / 10x5x5cm",
      reference_images: [
        "https://cdn.example.test/hat-black.jpg",
        "https://cdn.example.test/hat-main-1.jpg",
        "https://cdn.example.test/hat-main-2.jpg",
        "https://cdn.example.test/hat-khaki.jpg"
      ]
    }));
    expect(preview.rows[0]?.sourceText).toContain("规格选项：ブラック、カーキ");
    expect(preview.rows[1]?.product).toEqual(expect.objectContaining({
      sku: "DXM-1735937427580945964",
      title_ja: "折りたたみエコバッグ",
      dimensions: "重量 0.2kg / 10x10x10cm"
    }));
  });

  it("deduplicates TikTok image resize and origin URL variants within grouped SKU exports", async () => {
    const bytes = makeInlineStringXlsx([
      [
        "SKU ID",
        "产品ID",
        "产品名称",
        "产品类目",
        "规格",
        "SKU图片url",
        "产品主图url",
        "包裹重量",
        "包裹尺寸"
      ],
      [
        "sku-1",
        "product-1",
        "UVカット 日よけ帽子",
        "スポーツ・アウトドア>スポーツ・アウトドア用帽子>",
        "ブラック",
        "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/f86ebc7438124081bc97ac72f8af6a84~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?from=resize",
        "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/f86ebc7438124081bc97ac72f8af6a84~tplv-aphluv4xwc-origin-jpeg.jpeg?from=origin,https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/47331b87fa98431f96b86fd44e6c3a33~tplv-aphluv4xwc-origin-jpeg.jpeg?dr=1",
        "0.1",
        "长：10,宽：5, 高：5"
      ],
      [
        "sku-2",
        "product-1",
        "UVカット 日よけ帽子",
        "スポーツ・アウトドア>スポーツ・アウトドア用帽子>",
        "カーキ",
        "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/f86ebc7438124081bc97ac72f8af6a84~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?from=another-resize",
        "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/47331b87fa98431f96b86fd44e6c3a33~tplv-aphluv4xwc-origin-jpeg.jpeg?dr=2",
        "0.1",
        "长：10,宽：5, 高：5"
      ]
    ], "A1:I3");

    const preview = await parseProductImportFile({
      fileName: "导出#SKU.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes,
      existingSkus: []
    });

    expect(preview.summary.total).toBe(1);
    expect(preview.rows[0]?.referenceImageCount).toBe(2);
    expect(preview.rows[0]?.product?.reference_images).toEqual([
      "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/f86ebc7438124081bc97ac72f8af6a84~tplv-aphluv4xwc-origin-jpeg.jpeg?from=origin",
      "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/47331b87fa98431f96b86fd44e6c3a33~tplv-aphluv4xwc-origin-jpeg.jpeg?dr=1"
    ]);
  });

  it("returns only explicitly selected successful rows for current-product fill or batch commit", async () => {
    const csv = [
      "SKU,商品名,カテゴリ,素材,サイズ,卖点,使用场景,主图",
      "ARM-001,接触冷感アームカバー,アームカバー,ポリエステル,約52cm,通気性のある生地,通勤,https://cdn.example.test/arm-main.jpg",
      ",,アームカバー,ポリエステル,約52cm,,通勤,https://cdn.example.test/broken-main.jpg"
    ].join("\n");
    const preview = await parseProductImportFile({
      fileName: "products.csv",
      mimeType: "text/csv",
      bytes: Buffer.from(csv, "utf8"),
      existingSkus: []
    });

    expect(preview.rows[1]?.status).toBe("failed");
    expect(selectedFileImportRows(preview.rows, [preview.rows[0]!.rowId, preview.rows[1]!.rowId]).map((row) => row.product?.sku)).toEqual([
      "ARM-001"
    ]);
  });

  it("does not return already imported duplicate rows for batch commit", async () => {
    const csv = [
      "SKU,商品名,カテゴリ,素材,サイズ,卖点,使用场景,主图",
      "ARM-001,接触冷感アームカバー,アームカバー,ポリエステル,約52cm,通気性のある生地,通勤,https://cdn.example.test/arm-main.jpg",
      "WALLET-001,ラウンドファスナー ミニ財布,財布,PUレザー,約11x9x3cm,カードを整理しやすい,買い物,https://cdn.example.test/wallet-main.webp"
    ].join("\n");

    const preview = await parseProductImportFile({
      fileName: "products.csv",
      mimeType: "text/csv",
      bytes: Buffer.from(csv, "utf8"),
      existingSkus: ["WALLET-001"]
    });

    expect(preview.rows.map((row) => row.status)).toEqual(["ready", "duplicate"]);
    expect(selectedFileImportRows(preview.rows, preview.rows.map((row) => row.rowId)).map((row) => row.product?.sku)).toEqual([
      "ARM-001"
    ]);
  });
});
