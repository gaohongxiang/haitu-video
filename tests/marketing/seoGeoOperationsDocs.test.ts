import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const operationsDocPath = "docs/marketing/seo-geo-operations.md";
const packageJsonPath = "package.json";
const roadmapPath = "docs/marketing/seo-geo-roadmap.md";
const moduleDocPath = "docs/modules/marketing-seo.md";
const monitoringLogPath = "docs/marketing/seo-geo-monitoring-log.md";

describe("SEO/GEO operations documentation", () => {
  it("documents launch verification, webmaster submission, monitoring, and evidence capture", async () => {
    const doc = await readFile(operationsDocPath, "utf8");

    expect(doc).toContain("# Haitu SEO / GEO 运营手册");
    expect(doc).toContain("## 1. 本地合并前检查");
    expect(doc).toContain("npm test -- tests/marketing/renderMarketingPage.test.ts tests/server/marketingRoutes.test.ts --reporter=verbose");
    expect(doc).toContain("npm test -- tests/marketing/checkSeoGeoProduction.test.ts --reporter=verbose");
    expect(doc).toContain("npm run seo:check -- --base https://haitu.online");
    expect(doc).toContain("遍历当前本地公开页面矩阵的中英文路径");
    expect(doc).toContain("sitemap.xml` 全量覆盖");
    expect(doc).toContain("npm run typecheck");
    expect(doc).toContain("npm run build:console");
    expect(doc).toContain("## 2. 生产上线后无痕检查");
    expect(doc).toContain("https://haitu.online/");
    expect(doc).toContain("https://haitu.online/en/");
    expect(doc).toContain("https://haitu.online/terms");
    expect(doc).toContain("https://haitu.online/privacy");
    expect(doc).toContain("https://haitu.online/refund");
    expect(doc).toContain("https://haitu.online/contact");
    expect(doc).toContain("X-Robots-Tag: noindex, nofollow");
    expect(doc).toContain("## 3. Google Search Console 和 Bing Webmaster Tools");
    expect(doc).toContain("提交 sitemap");
    expect(doc).toContain("https://haitu.online/sitemap.xml");
    expect(doc).toContain("## 4. GEO 月度监控");
    expect(doc).toContain("ChatGPT Search");
    expect(doc).toContain("Perplexity");
    expect(doc).toContain("Google AI Mode");
    expect(doc).toContain("Bing Copilot");
    expect(doc).toContain("## 5. 真实截图和案例图");
    expect(doc).toContain("不要使用模糊、抽象、纯氛围图作为核心产品证据");
    expect(doc).toContain("## 6. 记录模板");
    expect(doc).toContain("是否提及 Haitu");
    expect(doc).toContain("是否链接到 https://haitu.online");
  });

  it("links the operations runbook from the roadmap and marketing module docs", async () => {
    const roadmap = await readFile(roadmapPath, "utf8");
    const moduleDoc = await readFile(moduleDocPath, "utf8");

    expect(roadmap).toContain("[SEO / GEO 运营手册](seo-geo-operations.md)");
    expect(roadmap).toContain("[SEO / GEO 监控记录](seo-geo-monitoring-log.md)");
    expect(moduleDoc).toContain("[SEO / GEO 运营手册](../marketing/seo-geo-operations.md)");
    expect(moduleDoc).toContain("[SEO / GEO 监控记录](../marketing/seo-geo-monitoring-log.md)");
  });

  it("provides an append-only monitoring log template for search, GEO, media evidence, and thin content reviews", async () => {
    const doc = await readFile(monitoringLogPath, "utf8");
    const operations = await readFile(operationsDocPath, "utf8");

    expect(operations).toContain("[SEO / GEO 监控记录](seo-geo-monitoring-log.md)");
    expect(doc).toContain("# Haitu SEO / GEO 监控记录");
    expect(doc).toContain("只追加，不覆盖历史记录");
    expect(doc).toContain("## 每周搜索引擎记录");
    expect(doc).toContain("Google Search Console");
    expect(doc).toContain("Bing Webmaster Tools");
    expect(doc).toContain("索引覆盖");
    expect(doc).toContain("新增查询词");
    expect(doc).toContain("异常 URL");
    expect(doc).toContain("## 每月 GEO 答案引擎记录");
    expect(doc).toContain("ChatGPT Search");
    expect(doc).toContain("Perplexity");
    expect(doc).toContain("Google AI Mode");
    expect(doc).toContain("Bing Copilot");
    expect(doc).toContain("是否错误使用“海兔”");
    expect(doc).toContain("## 真实截图和案例素材记录");
    expect(doc).toContain("是否脱敏");
    expect(doc).toContain("alt 文本");
    expect(doc).toContain("## 季度薄内容清理记录");
    expect(doc).toContain("保留 / 合并 / 重写 / 下线");
    expect(doc).toContain("## 生产上线记录");
    expect(doc).toContain("npm run seo:check -- --base https://haitu.online");
  });

  it("documents the SEO/GEO release boundary so deployments do not mix unrelated product work", async () => {
    const operations = await readFile(operationsDocPath, "utf8");
    const roadmap = await readFile(roadmapPath, "utf8");

    expect(operations).toContain("## 7. SEO/GEO 发布边界");
    expect(operations).toContain("只纳入 SEO/GEO 相关文件");
    expect(operations).toContain("docs/marketing/");
    expect(operations).toContain("docs/modules/marketing-seo.md");
    expect(operations).toContain("src/marketing/renderMarketingPage.ts");
    expect(operations).toContain("src/i18n/");
    expect(operations).toContain("src/server/consolePublicRoutes.ts");
    expect(operations).toContain("src/server/static/seo-og.png");
    expect(operations).toContain("scripts/check-seo-geo-production.ts");
    expect(operations).toContain("tests/marketing/");
    expect(operations).toContain("tests/server/marketingRoutes.test.ts");
    expect(operations).toContain("tests/deploy/noDockerDeploy.test.ts");
    expect(operations).toContain("不要混入后台、账单、模型供应商、视频生成、商品导入等其他会话改动");
    expect(operations).toContain("git diff --name-only");
    expect(operations).toContain("npm run seo:scope");
    expect(operations).toContain("npm run seo:scope -- --staged");
    expect(operations).toContain("先 stage 计划发布的 SEO/GEO 文件");
    expect(roadmap).toContain("SEO/GEO 发布边界");
  });

  it("exposes the production SEO/GEO checker as an npm script", async () => {
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["seo:check"]).toBe("tsx scripts/check-seo-geo-production.ts");
    expect(packageJson.scripts?.["seo:scope"]).toBe("tsx scripts/check-seo-geo-release-scope.ts");
  });
});
