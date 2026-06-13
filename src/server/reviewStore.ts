import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface ProductReviewState {
  selectedFinalJobId?: string;
  note?: string;
  versionReviews?: Record<string, ManualVersionReview>;
}

export interface ReviewState {
  products: Record<string, ProductReviewState>;
}

export type ManualReviewDecision = "publishable" | "needs-edit" | "rejected";

export interface ManualVersionReview {
  decision: ManualReviewDecision;
  score: number;
  note?: string;
  updatedAt: string;
}

export interface SelectFinalInput {
  productSku: string;
  jobId: string;
  note?: string;
}

export interface ManualReviewInput {
  productSku: string;
  jobId: string;
  decision: ManualReviewDecision;
  score: number;
  note?: string;
}

export class FileReviewStore {
  constructor(private readonly path: string) {}

  async read(): Promise<ReviewState> {
    try {
      return normalizeReviewState(JSON.parse(await readFile(this.path, "utf8")));
    } catch (error) {
      if (isMissingFileError(error)) {
        return { products: {} };
      }
      throw error;
    }
  }

  async setSelectedFinal(input: SelectFinalInput): Promise<ReviewState> {
    const state = await this.read();
    state.products[input.productSku] = {
      ...state.products[input.productSku],
      selectedFinalJobId: input.jobId,
      note: input.note
    };
    await this.write(state);
    return state;
  }

  async setManualReview(input: ManualReviewInput): Promise<ReviewState> {
    const state = await this.read();
    const productReview = state.products[input.productSku] ?? {};
    productReview.versionReviews = {
      ...productReview.versionReviews,
      [input.jobId]: {
        decision: input.decision,
        score: input.score,
        note: input.note,
        updatedAt: new Date().toISOString()
      }
    };
    state.products[input.productSku] = productReview;
    await this.write(state);
    return state;
  }

  private async write(state: ReviewState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(state, null, 2), "utf8");
  }
}

function normalizeReviewState(value: unknown): ReviewState {
  if (!value || typeof value !== "object" || !("products" in value)) {
    return { products: {} };
  }
  const products = (value as { products?: unknown }).products;
  if (!products || typeof products !== "object") {
    return { products: {} };
  }
  return {
    products: Object.fromEntries(
      Object.entries(products as Record<string, ProductReviewState>).map(([productSku, review]) => [
        productSku,
        {
          selectedFinalJobId: review?.selectedFinalJobId,
          note: review?.note,
          versionReviews: normalizeVersionReviews(review?.versionReviews)
        }
      ])
    )
  };
}

function normalizeVersionReviews(value: unknown): Record<string, ManualVersionReview> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const reviews: Record<string, ManualVersionReview> = {};
  for (const [jobId, review] of Object.entries(value as Record<string, Partial<ManualVersionReview>>)) {
    if (
      !review ||
      !isManualReviewDecision(review.decision) ||
      typeof review.score !== "number" ||
      typeof review.updatedAt !== "string"
    ) {
      continue;
    }
    reviews[jobId] = {
      decision: review.decision,
      score: review.score,
      note: review.note,
      updatedAt: review.updatedAt
    };
  }
  return Object.keys(reviews).length > 0 ? reviews : undefined;
}

export function isManualReviewDecision(value: unknown): value is ManualReviewDecision {
  return value === "publishable" || value === "needs-edit" || value === "rejected";
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
