import { execFileSync } from "node:child_process";

export interface SeoGeoReleaseScopeResult {
  ok: boolean;
  outOfScopeFiles: string[];
}

export type SeoGeoReleaseScopeMode = "all" | "staged";

interface SeoGeoReleaseScopeFileCollectionOptions {
  mode: SeoGeoReleaseScopeMode;
  readGitOutput?: (args: string[]) => string;
}

const allowedExactFiles = new Set([
  "deploy/env/haitu-video.env.example",
  "deploy/scripts/deploy-from-github.sh",
  "package-lock.json",
  "package.json",
  "src/marketing/renderMarketingPage.ts",
  "src/server/consolePublicRoutes.ts",
  "src/server/static/seo-og.png",
  "src/server/static/seo-og.svg",
  "tests/deploy/noDockerDeploy.test.ts",
  "tests/server/marketingRoutes.test.ts"
]);

const allowedPrefixes = [
  "docs/marketing/",
  "docs/modules/marketing-seo.md",
  "docs/operations/",
  "scripts/check-seo-geo-",
  "src/i18n/",
  "tests/marketing/"
];

export function checkSeoGeoReleaseScope(files: string[]): SeoGeoReleaseScopeResult {
  const normalizedFiles = files
    .map((file) => file.trim())
    .filter(Boolean)
    .map((file) => file.replace(/^\.\//, ""));
  const outOfScopeFiles = normalizedFiles.filter((file) => !isAllowedSeoGeoReleaseFile(file));

  return {
    ok: outOfScopeFiles.length === 0,
    outOfScopeFiles
  };
}

export function collectSeoGeoReleaseScopeFiles(options: SeoGeoReleaseScopeFileCollectionOptions): string[] {
  const readGitOutput = options.readGitOutput ?? readGitOutputFromGit;

  if (options.mode === "staged") {
    return splitGitFileList(readGitOutput(["diff", "--cached", "--name-only"]));
  }

  return [
    ...splitGitFileList(readGitOutput(["diff", "--name-only"])),
    ...splitGitFileList(readGitOutput(["ls-files", "--others", "--exclude-standard"]))
  ];
}

function isAllowedSeoGeoReleaseFile(file: string): boolean {
  return allowedExactFiles.has(file) || allowedPrefixes.some((prefix) => file.startsWith(prefix));
}

function readGitOutputFromGit(args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8"
  });
}

function splitGitFileList(value: string): string[] {
  return value.split("\n").filter(Boolean);
}

function main(): void {
  const mode: SeoGeoReleaseScopeMode = process.argv.includes("--staged") ? "staged" : "all";
  const result = checkSeoGeoReleaseScope(collectSeoGeoReleaseScopeFiles({ mode }));

  if (result.ok) {
    console.log(`SEO/GEO release scope check passed (${mode}).`);
    return;
  }

  console.error("SEO/GEO release scope check failed. Out-of-scope files:");
  for (const file of result.outOfScopeFiles) {
    console.error(`- ${file}`);
  }
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
