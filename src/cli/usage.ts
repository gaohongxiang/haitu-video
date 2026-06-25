import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";

import {
  VolcengineUsageClient,
  type ListUsageTasksRequest,
  type UsageReport,
  type UsageTaskItem
} from "../providers/volcengine/usageClient.js";

export interface UsageCliOptions {
  cwd?: string;
  fetchImpl?: typeof fetch;
}

interface UsageArgs extends ListUsageTasksRequest {
  apiKey?: string;
  tokenPriceCnyPerMillion: number;
  taskId?: string;
  cancelTaskId?: string;
  deleteTaskId?: string;
  confirm: boolean;
}

export async function runUsageCli(
  argv: string[],
  options: UsageCliOptions = {}
): Promise<string> {
  loadDotenv({
    path: join(options.cwd ?? process.cwd(), ".env"),
    override: false,
    quiet: true
  });
  const args = parseArgs(argv);
  const client = new VolcengineUsageClient({
    apiKey: args.apiKey,
    fetchImpl: options.fetchImpl,
    tokenPriceCnyPerMillion: args.tokenPriceCnyPerMillion
  });
  if (args.taskId) {
    const task = await client.getTask(args.taskId);
    return formatUsageTask(task, args.tokenPriceCnyPerMillion);
  }
  if (args.cancelTaskId) {
    const task = await client.getTask(args.cancelTaskId);
    if (task.status !== "queued") {
      throw new Error(
        `Can cancel only queued tasks. Task ${args.cancelTaskId} is ${task.status ?? "unknown"}.`
      );
    }
    await client.deleteTask(args.cancelTaskId);
    return `Cancelled queued task: ${args.cancelTaskId}`;
  }
  if (args.deleteTaskId) {
    if (!args.confirm) {
      throw new Error("Deleting a task requires --confirm true.");
    }
    await client.deleteTask(args.deleteTaskId);
    return `Deleted task: ${args.deleteTaskId}`;
  }
  const report = await client.listTasks(args);
  return formatUsageReport(report);
}

function parseArgs(argv: string[]): UsageArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near "${key ?? ""}"`);
    }
    values.set(key.slice(2), value);
  }

  return {
    pageNum: parseInteger(values.get("pageNum") ?? "1", "--pageNum", 1, 500),
    pageSize: parseInteger(values.get("pageSize") ?? "20", "--pageSize", 1, 500),
    status: parseStatus(values.get("status")),
    taskIds: parseTaskIds(values.get("taskIds")),
    model: values.get("model"),
    serviceTier: parseServiceTier(values.get("serviceTier")),
    apiKey: values.get("apiKey"),
    taskId: values.get("taskId"),
    cancelTaskId: values.get("cancelTaskId"),
    deleteTaskId: values.get("deleteTaskId"),
    confirm: parseBoolean(values.get("confirm") ?? "false"),
    tokenPriceCnyPerMillion: parseNumber(
      values.get("tokenPriceCnyPerMillion") ??
        process.env.SEEDANCE_TOKEN_PRICE_CNY_PER_MILLION ??
        "37",
      "--tokenPriceCnyPerMillion"
    )
  };
}

function formatUsageTask(task: UsageTaskItem, tokenPriceCnyPerMillion: number): string {
  return [
    "Volcengine Seedance Task",
    `Token price: ${tokenPriceCnyPerMillion} CNY / 1,000,000 tokens`,
    "",
    `Task ID: ${task.id}`,
    `Status: ${task.status ?? "-"}`,
    `Model: ${task.model ?? "-"}`,
    `Duration: ${formatOptionalNumber(task.durationSeconds)}`,
    `Resolution: ${task.resolution ?? "-"}`,
    `Ratio: ${task.ratio ?? "-"}`,
    `Tokens: ${task.totalTokens}`,
    `Estimated cost: ${task.estimatedCostCny.toFixed(2)} CNY`
  ].join("\n");
}

function formatUsageReport(report: UsageReport): string {
  const lines = [
    "Volcengine Seedance Usage",
    `Token price: ${report.tokenPriceCnyPerMillion} CNY / 1,000,000 tokens`,
    "",
    [
      "task_id",
      "status",
      "model",
      "duration",
      "resolution",
      "ratio",
      "tokens",
      "estimated_cost"
    ].join("\t")
  ];

  for (const item of report.items) {
    lines.push(
      [
        item.id,
        item.status ?? "-",
        item.model ?? "-",
        formatOptionalNumber(item.durationSeconds),
        item.resolution ?? "-",
        item.ratio ?? "-",
        String(item.totalTokens),
        `${item.estimatedCostCny.toFixed(2)} CNY`
      ].join("\t")
    );
  }

  lines.push("");
  lines.push(`Total tasks: ${report.total}`);
  lines.push(`Total tokens: ${report.totalTokens}`);
  lines.push(`Estimated total: ${report.estimatedCostCny.toFixed(2)} CNY`);
  return lines.join("\n");
}

function parseStatus(value: string | undefined): UsageArgs["status"] {
  if (value === undefined) {
    return undefined;
  }
  const allowed: Array<NonNullable<UsageArgs["status"]>> = [
    "queued",
    "running",
    "cancelled",
    "succeeded",
    "failed"
  ];
  if (!allowed.includes(value as NonNullable<UsageArgs["status"]>)) {
    throw new Error(`--status must be one of: ${allowed.join(", ")}`);
  }
  return value as UsageArgs["status"];
}

function parseServiceTier(value: string | undefined): UsageArgs["serviceTier"] {
  if (value === undefined) {
    return undefined;
  }
  if (value !== "default" && value !== "flex") {
    throw new Error("--serviceTier must be one of: default, flex");
  }
  return value;
}

function parseTaskIds(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseInteger(value: string, name: string, min: number, max: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function parseNumber(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return parsed;
}

function parseBoolean(value: string): boolean {
  return ["1", "true", "yes"].includes(value.toLowerCase());
}

function formatOptionalNumber(value: number | undefined): string {
  return value === undefined ? "-" : String(value);
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? fileURLToPath(new URL(`file://${process.argv[1]}`)) : "";

if (currentFile === invokedFile) {
  runUsageCli(process.argv.slice(2))
    .then((output) => {
      process.stdout.write(`${output}\n`);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
