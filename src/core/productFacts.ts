import { z } from "zod";

export const productFactsSchema = z.object({
  sku: z.string().min(1, "sku is required"),
  title_ja: z.string().min(1, "title_ja is required"),
  category: z.string().min(1, "category is required"),
  materials: z.array(z.string().min(1)).min(1, "materials must not be empty"),
  dimensions: z.string().min(1, "dimensions is required"),
  verified_selling_points: z
    .array(z.string().min(1))
    .min(1, "verified_selling_points must not be empty"),
  usage_scenes: z.array(z.string().min(1)).min(1, "usage_scenes must not be empty"),
  forbidden_claims: z.array(z.string().min(1)).min(1, "forbidden_claims must not be empty"),
  reference_images: z.array(z.string().min(1)).min(1, "reference_images must not be empty")
});

export type ProductFacts = z.infer<typeof productFactsSchema>;

export function parseProductFacts(input: unknown): ProductFacts {
  return productFactsSchema.parse(input);
}
