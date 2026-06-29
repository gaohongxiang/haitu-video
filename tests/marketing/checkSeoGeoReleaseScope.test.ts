import { describe, expect, it } from "vitest";

import {
  checkSeoGeoReleaseScope,
  collectSeoGeoReleaseScopeFiles
} from "../../scripts/check-seo-geo-release-scope.js";

describe("SEO/GEO release scope checker", () => {
  it("allows the marketing SEO/GEO release file families", () => {
    const result = checkSeoGeoReleaseScope([
      "deploy/env/haitu-video.env.example",
      "deploy/scripts/deploy-from-github.sh",
      "docs/marketing/seo-geo-roadmap.md",
      "docs/modules/marketing-seo.md",
      "docs/operations/runbook.md",
      "package-lock.json",
      "package.json",
      "scripts/check-seo-geo-production.ts",
      "scripts/check-seo-geo-release-scope.ts",
      "src/i18n/locales/zh/marketing.json",
      "src/marketing/renderMarketingPage.ts",
      "src/server/consolePublicRoutes.ts",
      "src/server/static/seo-og.png",
      "tests/deploy/noDockerDeploy.test.ts",
      "tests/marketing/checkSeoGeoProduction.test.ts",
      "tests/server/marketingRoutes.test.ts"
    ]);

    expect(result.ok).toBe(true);
    expect(result.outOfScopeFiles).toEqual([]);
  });

  it("reports unrelated product, billing, provider, and admin files as out of scope", () => {
    const result = checkSeoGeoReleaseScope([
      "docs/marketing/seo-geo-roadmap.md",
      "src/server/stripePaymentService.ts",
      "src/providers/volcengine/seedanceProvider.ts",
      "src/client/AdminApp.tsx",
      "tests/server/billingPolicy.test.ts"
    ]);

    expect(result.ok).toBe(false);
    expect(result.outOfScopeFiles).toEqual([
      "src/server/stripePaymentService.ts",
      "src/providers/volcengine/seedanceProvider.ts",
      "src/client/AdminApp.tsx",
      "tests/server/billingPolicy.test.ts"
    ]);
  });

  it("can check only staged files when preparing an isolated SEO/GEO release", () => {
    const allFiles = collectSeoGeoReleaseScopeFiles({
      mode: "all",
      readGitOutput: (args) => {
        if (args.join(" ") === "diff --name-only") {
          return "src/server/stripePaymentService.ts\n";
        }
        if (args.join(" ") === "ls-files --others --exclude-standard") {
          return "docs/marketing/seo-geo-roadmap.md\n";
        }
        throw new Error(`unexpected git args: ${args.join(" ")}`);
      }
    });
    const stagedFiles = collectSeoGeoReleaseScopeFiles({
      mode: "staged",
      readGitOutput: (args) => {
        if (args.join(" ") === "diff --cached --name-only") {
          return "docs/marketing/seo-geo-roadmap.md\nscripts/check-seo-geo-release-scope.ts\n";
        }
        throw new Error(`unexpected git args: ${args.join(" ")}`);
      }
    });

    expect(allFiles).toEqual([
      "src/server/stripePaymentService.ts",
      "docs/marketing/seo-geo-roadmap.md"
    ]);
    expect(stagedFiles).toEqual([
      "docs/marketing/seo-geo-roadmap.md",
      "scripts/check-seo-geo-release-scope.ts"
    ]);
    expect(checkSeoGeoReleaseScope(stagedFiles).ok).toBe(true);
  });
});
