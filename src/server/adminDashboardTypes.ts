import type { ReadableVideoProviderErrorInput } from "../core/videoProviderErrors.js";

export interface AdminOverview {
  metrics: {
    totalUsers: number;
    verifiedUsers: number;
    newUsersToday: number;
    newUsers7d: number;
    activeUsers7d: number;
    totalWorkspaces: number;
    totalProducts: number;
    totalVideoJobs: number;
  };
  growth: Array<{
    date: string;
    registrations: number;
  }>;
  activity: Array<{
    date: string;
    activeUsers: number;
    events: number;
  }>;
  users: AdminUserSummary[];
}

export interface AdminUserSummary {
  id: string;
  email: string;
  displayName?: string;
  role: string;
  emailVerified: boolean;
  workspaceCount: number;
  productCount: number;
  videoJobCount: number;
  createdAt: string;
  lastActiveAt?: string;
}

export interface AdminUserDetail {
  user: AdminUserSummary & {
    lastSessionAt?: string;
  };
  videoStatusCounts: Record<string, number>;
  workspaces: AdminUserWorkspaceSummary[];
  products: AdminUserProductSummary[];
  videoJobs: AdminUserVideoJobSummary[];
}

export interface AdminUserWorkspaceSummary {
  id: string;
  name: string;
  role: string;
  ownerEmail?: string;
  memberCount: number;
  productCount: number;
  videoJobCount: number;
  completedJobCount: number;
  failedJobCount: number;
  queuedJobCount: number;
  expiredJobCount: number;
  lastVideoJobAt?: string;
}

export interface AdminUserProductSummary {
  id: string;
  workspaceId: string;
  sku: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserVideoJobSummary {
  id: string;
  workspaceId: string;
  productId?: string;
  productSku?: string;
  productTitle?: string;
  status: string;
  provider?: string;
  model?: string;
  language?: string;
  durationSeconds?: number;
  outputCount?: number;
  jobDir: string;
  error?: string;
  errorDetails?: ReadableVideoProviderErrorInput;
  readableError?: string;
  createdAt: string;
  completedAt?: string;
  expiresAt?: string;
}
