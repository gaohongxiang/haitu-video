# Haitu Video

Haitu is an internal validation prototype for an AI product video generation platform. The first phase is intentionally low-cost: no Docker, no database, no Redis, and no paid SaaS beyond the future Seedance-style video API.

## Phase 1 Flow

```text
product JSON
  -> Japanese script
  -> Seedance-style prompt
  -> mock video provider
  -> local manifest and cost summary
```

The mock provider is free and writes placeholder files. It exists so the pipeline, cost tracking, and QC structure can be tested before connecting a paid video model.

## Setup

```bash
npm install
```

## Test

```bash
npm test
npm run typecheck
```

## Generate Mock Outputs

```bash
npm run generate -- \
  --product fixtures/products/sample-storage-box.json \
  --versions 3 \
  --outDir outputs
```

Generated files are written under `outputs/` and ignored by git.

## Generate With Seedance

The CLI defaults to the free `mock` provider. It will not call Seedance unless you explicitly choose it.

The current real provider is the domestic Volcengine Ark Seedance adapter, based on the official Chinese docs:

- Create task: https://www.volcengine.com/docs/82379/1520757?lang=zh
- Query one task: https://www.volcengine.com/docs/82379/1521309?lang=zh
- List task usage: https://www.volcengine.com/docs/82379/1521675?lang=zh
- Cancel or delete task: https://www.volcengine.com/docs/82379/1521720?lang=zh
- Pricing / billing reference: https://www.volcengine.com/docs/82379/1541595?lang=zh

Create a local `.env` file:

```bash
cp .env.example .env
```

Then edit `.env`:

```env
ARK_API_KEY=your-modelark-api-key
```

Run one paid smoke test only after checking the estimated cost:

```bash
npm run generate -- \
  --product fixtures/products/sample-storage-box.json \
  --versions 1 \
  --duration 8 \
  --outDir outputs \
  --provider volcengine-seedance \
  --confirmPaid true
```

Optional environment variables:

```bash
export SEEDANCE_API_KEY="your-modelark-api-key"
export SEEDANCE_BASE_URL="https://ark.cn-beijing.volces.com"
export SEEDANCE_MODEL="doubao-seedance-2-0-260128"
export SEEDANCE_RESOLUTION="480p"
export SEEDANCE_WATERMARK="false"
export SEEDANCE_POLL_MS="5000"
export SEEDANCE_MAX_POLLS="120"
export SEEDANCE_ESTIMATED_COST_CNY_PER_SECOND="0.8"
export SEEDANCE_ESTIMATED_COST_CURRENCY="CNY"
```

Use `ARK_API_KEY` or `SEEDANCE_API_KEY`; either is accepted. The default product-job duration is 8 seconds and the default Seedance resolution is 480p for low-cost TikTok Shop traffic videos. Based on the first real 15 second run, 8 seconds is estimated at about 6.4 CNY per video. Keep `--versions 1` and `--duration 8` for the first paid smoke test; 15 seconds should be treated as an expensive polished-export option. Paid providers require `--confirmPaid true` so accidental CLI runs do not call the API. `--provider seedance` is kept as a legacy alias, but manifests use the canonical provider name `volcengine-seedance`.

## Query Seedance Usage

Generated manifests store the provider task id and actual token usage when Volcengine returns it, so customer support can show usage per video directly from the job record.

For recent tasks or billing reconciliation, use the read-only usage query API. It only sends a `GET` request to Volcengine and does not create or regenerate videos:

```bash
npm run usage -- \
  --status succeeded \
  --pageSize 20
```

Useful filters:

```bash
npm run usage -- --taskIds cgt-xxx,cgt-yyy
npm run usage -- --model doubao-seedance-2-0-260128 --status succeeded
```

Query one task by provider task id:

```bash
npm run usage -- --taskId cgt-xxx
```

Cancel a queued task:

```bash
npm run usage -- --cancelTaskId cgt-queued
```

Volcengine only supports cancelling tasks that are still `queued`; running tasks cannot be cancelled by this command. Delete a finished or failed provider task record only after preserving the local manifest and downloaded video:

```bash
npm run usage -- --deleteTaskId cgt-done --confirm true
```

The report uses `usage.total_tokens` and the default price `37 CNY / 1,000,000 tokens`. Override it if the official price changes:

```bash
npm run usage -- --tokenPriceCnyPerMillion 37
```

Volcengine task queries are useful for recent reconciliation, but Haitu still keeps videos, manifests, prompt, script, task id, usage, and cost records locally for long-term customer support.

Reference images in product JSON can be:

- public URLs, such as `https://.../main.jpg`
- local relative paths, resolved from the product JSON file directory
- base64 data URLs, such as `data:image/png;base64,...`
- Volcengine asset IDs, such as `asset://...`

## Product Fact Rules

Scripts and prompts must use verified facts only:

- `verified_selling_points` are allowed claims.
- `forbidden_claims` are blocked or unverified claims.
- Reference images guide the future video provider.
- Subtitles, CTA, price, logo, and watermark should be added in post-processing later.

## Current Provider Status

- `mock`: implemented, free local placeholder provider.
- `volcengine-seedance`: implemented as an async Volcengine Ark provider. It creates a generation task, polls for completion, downloads the result, and records estimated cost.
- `seedance`: legacy CLI alias for `volcengine-seedance`.

## Provider Architecture

Core pipeline code depends only on the shared `VideoProvider` interface. Provider selection happens in `src/providers/providerFactory.ts`.

Future providers should be added as isolated modules, for example:

```text
src/providers/volcengine/seedanceProvider.ts
src/providers/veo/veoProvider.ts
src/providers/runway/runwayProvider.ts
src/providers/kling/klingProvider.ts
```

Each provider must keep the same interface and record provider, model, duration, aspect ratio, output path, and cost per generated version.
