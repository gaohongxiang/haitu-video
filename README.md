# Haitu Video

Haitu is an internal validation prototype for an AI product video generation platform. It now uses a unified model-service architecture for text, image, and video providers.

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
  --product examples/products/sample-storage-box.json \
  --versions 3
```

Generated files are written under `data/workspaces/default/jobs/generate/` by default and ignored by git. Set `HAITU_DATA_DIR` to move runtime data outside the repository.

## API Modes

Haitu supports two API billing modes:

- Platform models: admins configure provider keys in `/admin`; keys are encrypted in SQLite and users pick the platform text/image/video bundle from the creation UI. Users pay official upstream cost plus the platform service fee from their wallet balance.
- BYOK: users save their own API keys in API 管理. Upstream cost is paid by their provider account; Haitu only charges the service fee from wallet balance.

Platform keys are server-only and must never appear in frontend code or API responses. Keep `HAITU_SECRET_KEY` stable because it decrypts both platform keys and user BYOK keys stored in the database.

## Public SEO Site

The production server uses `/` as the Chinese acquisition homepage, `/en/` as the English international site, and `/app` for the logged-in creative console. Marketing pages are rendered as server HTML with canonical links, `hreflang`, structured data, `robots.txt`, and `sitemap.xml`; the app/admin shells are marked `noindex`.

## Generate With Seedance CLI

The CLI defaults to the free `mock` provider. It will not call Seedance unless you explicitly choose it.

The current real provider is the domestic Volcengine Ark Seedance adapter, based on the official Chinese docs:

- Create task: https://www.volcengine.com/docs/82379/1520757?lang=zh
- Query one task: https://www.volcengine.com/docs/82379/1521309?lang=zh
- List task usage: https://www.volcengine.com/docs/82379/1521675?lang=zh
- Cancel or delete task: https://www.volcengine.com/docs/82379/1521720?lang=zh
- Pricing / billing reference: https://www.volcengine.com/docs/82379/1541595?lang=zh

For local CLI smoke tests, pass the provider key explicitly:

```bash
Run one paid smoke test only after checking the estimated cost:

```bash
npm run generate -- \
  --product examples/products/sample-storage-box.json \
  --versions 1 \
  --duration 8 \
  --provider volcengine-seedance \
  --apiKey your-volcengine-key \
  --confirmPaid true
```

Optional environment variables:

```bash
export SEEDANCE_RESOLUTION="480p"
export SEEDANCE_WATERMARK="false"
export SEEDANCE_POLL_MS="5000"
export SEEDANCE_MAX_POLLS="120"
export SEEDANCE_ESTIMATED_COST_CNY_PER_SECOND="0.8"
export SEEDANCE_ESTIMATED_COST_CURRENCY="CNY"
```

The default product-job duration is 8 seconds and the default Seedance resolution is 480p for low-cost TikTok Shop traffic videos. Based on the first real 15 second run, 8 seconds is estimated at about 6.4 CNY per video. Keep `--versions 1` and `--duration 8` for the first paid smoke test; 15 seconds should be treated as an expensive polished-export option. Paid providers require `--confirmPaid true` so accidental CLI runs do not call the API. The canonical provider name is `volcengine-seedance`.

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
