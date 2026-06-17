# Future Object Storage Implementation Outline

## Goal

Move product images, provider raw outputs, final videos, subtitles, manifests, and publish packages from single-node filesystem storage to object storage while keeping SQLite as the metadata index.

## Candidate Backends

- Cloudflare R2
- Any S3-compatible service
- Volcengine TOS
- Aliyun OSS

The first implementation should prefer an S3-compatible interface if possible so R2 and many providers share the same adapter.

## Target Shape

- SQLite stores workspace id, product id, asset id, kind, mime type, size, storage provider, bucket, object key, status, created time, expiry, and deletion time.
- Product reference images are uploaded to object storage when imported, uploaded, or generated.
- Generated raw videos, final videos, subtitles, manifests, and publish packages are written to object storage after creation.
- Providers receive short-lived signed HTTPS URLs.
- Users receive signed download URLs or proxied downloads depending on auth requirements.
- Local filesystem storage remains available as a development and single-node fallback adapter.

## Phased Migration

1. Introduce an `AssetStorage` interface with local and S3-compatible adapters.
2. Write new product reference images through the storage interface.
3. Write new generated video artifacts through the storage interface.
4. Backfill or lazily migrate existing local assets.
5. Add lifecycle rules for generated videos and temporary provider assets.
6. Remove direct filesystem assumptions from UI download and provider URL code.

## Non-Goals For Current Seedance Fix

The current Seedance reference URL fix should not add object storage credentials, buckets, migration scripts, or a new deployment dependency. It should only define the resolver contract so this future migration is small.
