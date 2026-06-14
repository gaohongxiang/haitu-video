import { isAbsolute, join, resolve } from "node:path";

export const DEFAULT_WORKSPACE_ID = "default";

export function resolveDataDir(input: {
  rootDir: string;
  dataDir?: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const configured = input.dataDir ?? input.env?.HAITU_DATA_DIR;
  if (!configured || configured.trim() === "") {
    return resolve(input.rootDir, "data");
  }
  return isAbsolute(configured) ? resolve(configured) : resolve(input.rootDir, configured);
}

export function getStorageRoots(dataDir: string): {
  dataDir: string;
  systemDir: string;
  workspacesDir: string;
  backupsDir: string;
} {
  const root = resolve(dataDir);
  return {
    dataDir: root,
    systemDir: join(root, "system"),
    workspacesDir: join(root, "workspaces"),
    backupsDir: join(root, "backups")
  };
}

export function getWorkspacePaths(dataDir: string, workspaceId = DEFAULT_WORKSPACE_ID): {
  workspaceId: string;
  dir: string;
  productsDir: string;
  jobsDir: string;
  settingsDir: string;
  providerKeysFile: string;
} {
  const safeWorkspaceId = assertSafeSegment(workspaceId, "workspace id");
  const workspaceDir = join(getStorageRoots(dataDir).workspacesDir, safeWorkspaceId);
  const settingsDir = join(workspaceDir, "settings");
  return {
    workspaceId: safeWorkspaceId,
    dir: workspaceDir,
    productsDir: join(workspaceDir, "products"),
    jobsDir: join(workspaceDir, "jobs"),
    settingsDir,
    providerKeysFile: join(settingsDir, "provider-keys.json")
  };
}

export function getProductPaths(dataDir: string, workspaceId: string, sku: string): {
  dir: string;
  productFile: string;
  refsDir: string;
  storyboardsFile: string;
} {
  const workspace = getWorkspacePaths(dataDir, workspaceId);
  const safeSku = assertSafeSegment(sku, "product sku");
  const dir = join(workspace.productsDir, safeSku);
  return {
    dir,
    productFile: join(dir, "product.json"),
    refsDir: join(dir, "refs"),
    storyboardsFile: join(dir, "storyboards.json")
  };
}

export function getJobPaths(dataDir: string, workspaceId: string, jobId: string): {
  dir: string;
  jobFile: string;
  reportFile: string;
  rawDir: string;
  finalDir: string;
} {
  const workspace = getWorkspacePaths(dataDir, workspaceId);
  const safeJobId = assertSafeSegment(jobId, "job id");
  const dir = join(workspace.jobsDir, safeJobId);
  return {
    dir,
    jobFile: join(dir, "job.json"),
    reportFile: join(dir, "make-video-report.json"),
    rawDir: join(dir, "raw"),
    finalDir: join(dir, "final")
  };
}

function assertSafeSegment(value: string, label: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    isAbsolute(trimmed)
  ) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return trimmed;
}
