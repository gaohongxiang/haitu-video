export interface VolcengineUsageClientOptions {
  apiKey?: string;
  baseUrl?: string;
  tokenPriceCnyPerMillion?: number;
  fetchImpl?: typeof fetch;
}

export interface ListUsageTasksRequest {
  pageNum?: number;
  pageSize?: number;
  status?: "queued" | "running" | "cancelled" | "succeeded" | "failed";
  taskIds?: string[];
  model?: string;
  serviceTier?: "default" | "flex";
}

export interface UsageTaskItem {
  id: string;
  model?: string;
  status?: string;
  completionTokens?: number;
  totalTokens: number;
  estimatedCostCny: number;
  createdAt?: number;
  updatedAt?: number;
  resolution?: string;
  ratio?: string;
  durationSeconds?: number;
  serviceTier?: string;
}

export interface UsageReport {
  total: number;
  items: UsageTaskItem[];
  totalTokens: number;
  estimatedCostCny: number;
  tokenPriceCnyPerMillion: number;
}

interface VolcengineTaskListResponse {
  total?: number;
  items?: Array<{
    id?: string;
    model?: string;
    status?: string;
    usage?: {
      completion_tokens?: number;
      total_tokens?: number;
    };
    created_at?: number;
    updated_at?: number;
    resolution?: string;
    ratio?: string;
    duration?: number;
    service_tier?: string;
  }>;
  error?: {
    code?: string;
    message?: string;
  };
}

interface VolcengineTaskResponse {
  id?: string;
  model?: string;
  status?: string;
  usage?: {
    completion_tokens?: number;
    total_tokens?: number;
  };
  created_at?: number;
  updated_at?: number;
  resolution?: string;
  ratio?: string;
  duration?: number;
  service_tier?: string;
}

export class VolcengineUsageClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly tokenPriceCnyPerMillion: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: VolcengineUsageClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.SEEDANCE_API_KEY ?? process.env.ARK_API_KEY ?? "";
    this.baseUrl =
      options.baseUrl ?? process.env.SEEDANCE_BASE_URL ?? "https://ark.cn-beijing.volces.com";
    this.tokenPriceCnyPerMillion =
      options.tokenPriceCnyPerMillion ??
      Number(process.env.SEEDANCE_TOKEN_PRICE_CNY_PER_MILLION ?? 37);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async listTasks(request: ListUsageTasksRequest = {}): Promise<UsageReport> {
    if (!this.apiKey) {
      throw new Error("Missing SEEDANCE_API_KEY or ARK_API_KEY. Cannot query usage.");
    }

    const response = await this.getJson<VolcengineTaskListResponse>(
      `/api/v3/contents/generations/tasks?${buildQuery(request)}`
    );
    const items = (response.items ?? []).map((item) => this.mapTaskItem(item));
    const totalTokens = items.reduce((sum, item) => sum + item.totalTokens, 0);

    return {
      total: response.total ?? items.length,
      items,
      totalTokens,
      estimatedCostCny: estimateCny(totalTokens, this.tokenPriceCnyPerMillion),
      tokenPriceCnyPerMillion: this.tokenPriceCnyPerMillion
    };
  }

  async getTask(taskId: string): Promise<UsageTaskItem> {
    if (!this.apiKey) {
      throw new Error("Missing SEEDANCE_API_KEY or ARK_API_KEY. Cannot query usage.");
    }
    const task = await this.getJson<VolcengineTaskResponse>(
      `/api/v3/contents/generations/tasks/${encodeURIComponent(taskId)}`
    );
    return this.mapTaskItem(task);
  }

  async deleteTask(taskId: string): Promise<void> {
    if (!this.apiKey) {
      throw new Error("Missing SEEDANCE_API_KEY or ARK_API_KEY. Cannot delete task.");
    }
    await this.requestJson<unknown>(
      `/api/v3/contents/generations/tasks/${encodeURIComponent(taskId)}`,
      "DELETE"
    );
  }

  private mapTaskItem(item: NonNullable<VolcengineTaskListResponse["items"]>[number]): UsageTaskItem {
    const totalTokens = item.usage?.total_tokens ?? item.usage?.completion_tokens ?? 0;
    return {
      id: item.id ?? "",
      model: item.model,
      status: item.status,
      completionTokens: item.usage?.completion_tokens,
      totalTokens,
      estimatedCostCny: estimateCny(totalTokens, this.tokenPriceCnyPerMillion),
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      resolution: item.resolution,
      ratio: item.ratio,
      durationSeconds: item.duration,
      serviceTier: item.service_tier
    };
  }

  private async getJson<T>(path: string): Promise<T> {
    return this.requestJson<T>(path, "GET");
  }

  private async requestJson<T>(path: string, method: "GET" | "DELETE"): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.apiKey}`
      }
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Volcengine usage API error ${response.status}: ${text}`);
    }
    if (!text) {
      return {} as T;
    }
    return JSON.parse(text) as T;
  }
}

function buildQuery(request: ListUsageTasksRequest): string {
  const params = new URLSearchParams();
  params.set("page_num", String(request.pageNum ?? 1));
  params.set("page_size", String(request.pageSize ?? 20));
  if (request.status) {
    params.set("filter.status", request.status);
  }
  for (const taskId of request.taskIds ?? []) {
    params.append("filter.task_ids", taskId);
  }
  if (request.model) {
    params.set("filter.model", request.model);
  }
  if (request.serviceTier) {
    params.set("filter.service_tier", request.serviceTier);
  }
  return params.toString();
}

function estimateCny(tokens: number, tokenPriceCnyPerMillion: number): number {
  return Math.round((tokens / 1_000_000) * tokenPriceCnyPerMillion * 100) / 100;
}
