import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import type { MakeVideoReport } from "../pipeline/makeVideoPipeline.js";

type QcSummaryResult = "pass" | "warning" | "fail" | "missing";

interface QcSummaryItem {
  jobId: string;
  reportPath: string;
  rawManifestPath?: string;
  productSku?: string;
  provider?: string;
  durationSeconds?: number;
  result: QcSummaryResult;
  failedChecks: string[];
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
  }>;
}

interface QcSummary {
  summary: {
    totalJobs: number;
    passJobs: number;
    warningJobs: number;
    failJobs: number;
    missingJobs: number;
  };
  items: QcSummaryItem[];
}

export async function buildQcSummary(outputsDir: string): Promise<QcSummary> {
  const reportPaths = await listNamedFiles(outputsDir, "make-video-report.json");
  const items = [];
  for (const reportPath of reportPaths) {
    const report = JSON.parse(await readFile(reportPath, "utf8")) as Partial<MakeVideoReport>;
    items.push(await toQcSummaryItem(reportPath, report));
  }
  items.sort(
    (left, right) =>
      qcResultRank(right.result) - qcResultRank(left.result) ||
      left.productSku?.localeCompare(right.productSku ?? "") ||
      left.jobId.localeCompare(right.jobId)
  );
  return {
    summary: summarizeQcItems(items),
    items
  };
}

async function toQcSummaryItem(
  reportPath: string,
  report: Partial<MakeVideoReport>
): Promise<QcSummaryItem> {
  const jobId = basename(dirname(reportPath));
  const rawManifestPath = report.raw?.manifestPath;
  const base = {
    jobId,
    reportPath,
    rawManifestPath,
    productSku: report.productSku,
    provider: report.provider,
    durationSeconds: report.durationSeconds
  };
  if (!rawManifestPath) {
    return {
      ...base,
      result: "missing",
      failedChecks: ["qc_manifest_missing"],
      checks: [
        {
          name: "qc_manifest_missing",
          passed: false,
          message: "Raw manifest path is missing from the make-video report."
        }
      ]
    };
  }
  try {
    const manifest = JSON.parse(await readFile(rawManifestPath, "utf8")) as {
      qc?: {
        result?: QcSummaryResult;
        checks?: Array<{
          name?: string;
          passed?: boolean;
          message?: string;
        }>;
      };
    };
    const checks = normalizeQcChecks(manifest.qc?.checks);
    const result = normalizeQcResult(manifest.qc?.result, checks);
    return {
      ...base,
      result,
      failedChecks: checks.filter((check) => !check.passed).map((check) => check.name),
      checks
    };
  } catch {
    return {
      ...base,
      result: "missing",
      failedChecks: ["qc_manifest_missing"],
      checks: [
        {
          name: "qc_manifest_missing",
          passed: false,
          message: `Raw manifest could not be read: ${rawManifestPath}`
        }
      ]
    };
  }
}

function normalizeQcChecks(
  checks: unknown
): QcSummaryItem["checks"] {
  if (!Array.isArray(checks)) {
    return [
      {
        name: "qc_checks_missing",
        passed: false,
        message: "QC checks are missing from the raw manifest."
      }
    ];
  }
  return checks.map((check, index) => {
    const item = isPlainObject(check) ? check : {};
    return {
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : `qc_check_${index + 1}`,
      passed: item.passed === true,
      message: typeof item.message === "string" ? item.message : ""
    };
  });
}

function normalizeQcResult(
  value: unknown,
  checks: QcSummaryItem["checks"]
): QcSummaryResult {
  if (value === "pass" || value === "warning" || value === "fail") {
    return value;
  }
  return checks.every((check) => check.passed) ? "pass" : "fail";
}

function summarizeQcItems(items: QcSummaryItem[]): QcSummary["summary"] {
  return {
    totalJobs: items.length,
    passJobs: items.filter((item) => item.result === "pass").length,
    warningJobs: items.filter((item) => item.result === "warning").length,
    failJobs: items.filter((item) => item.result === "fail").length,
    missingJobs: items.filter((item) => item.result === "missing").length
  };
}

function qcResultRank(result: QcSummaryResult): number {
  if (result === "fail") return 3;
  if (result === "missing") return 2;
  if (result === "warning") return 1;
  return 0;
}

async function listNamedFiles(root: string, fileName: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && entry.name === fileName) {
        found.push(path);
      }
    }
  }
  await walk(root);
  return found.sort();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
