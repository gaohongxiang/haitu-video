# Seedance Reference Asset URL Design

## Goal

Fix production Seedance video creation failures caused by sending local reference images as `data:image/...;base64,...` payloads. The first fix keeps the single-VPS storage model and does not add object storage.

## Scope

Implement two changes:

- Provide short-lived HTTPS URLs for local reference images when calling Volcengine Seedance.
- Preserve useful provider error details in video job records instead of collapsing failures to `fetch failed`.

Do not migrate product images or generated videos to R2, S3, TOS, OSS, or another object store in this change.

## Asset URL Design

The console server will expose a private asset-token registry in memory. Before a Seedance job starts, the pipeline asks the registry to create read-only tokens for the product reference images. Each token maps to one resolved local file path, mime type, workspace id, and expiry time.

Seedance receives URLs shaped like:

```text
https://haitu.online/api/public-assets/<token>
```

The route streams the mapped file only when:

- the token exists,
- the token has not expired,
- the file path is still inside the configured data directory,
- the request is a `GET` or `HEAD`.

Tokens are high-entropy random values and are not listable. Expired tokens are removed opportunistically when creating or reading tokens. The first TTL should be long enough for provider task creation, such as two hours.

The existing local files remain the source of truth. This URL layer only makes them temporarily reachable by the external provider.

## Provider Integration

`VolcengineSeedanceProvider` should accept an optional function that resolves local reference images into provider-readable URLs. When the resolver is present, local files are converted to temporary HTTPS URLs. Existing remote `http://` and `https://` references continue to pass through unchanged. Existing `data:image/` references can pass through for callers that already provide them, but product-local files should not be converted to data URIs for Seedance.

The console server provides the resolver because it knows the public base URL and owns the token registry. CLI usage can keep current behavior unless a resolver is supplied.

## Error Detail Design

Job failure records should store a richer error object or debug fields including:

- top-level message,
- error name,
- cause message,
- cause code,
- provider name,
- provider model,
- phase such as `create-task`, `poll-task`, or `download-output`,
- reference image count,
- whether temporary asset URLs were used.

The UI can continue showing the short user-facing message, but the job JSON should preserve enough detail for support and debugging.

## Testing

Add focused tests for:

- token route serves a mapped local image and rejects expired or unknown tokens,
- generated Seedance content uses temporary HTTPS URLs for local reference images,
- remote HTTPS references still pass through unchanged,
- provider failures preserve cause details in the job record.

Use mock fetches and temporary files. Do not call the real Volcengine API in tests.

## Future Object Storage Path

Add object storage in a later implementation phase. The target storage model is:

- keep SQLite as the metadata store for workspace id, product id, asset id, mime type, size, storage provider, object key, status, and expiry,
- store product reference images in object storage,
- store raw provider outputs, final videos, subtitle files, manifests, and publish packages in object storage,
- use short-lived signed URLs when external providers or users need temporary access,
- use lifecycle rules for generated videos and transient provider assets,
- keep the current local filesystem storage as a development and single-node fallback.

The first supported object store can be Cloudflare R2, S3-compatible storage, Volcengine TOS, Aliyun OSS, or another S3-compatible service. The application should hide that choice behind an asset storage interface so provider code still only asks for a provider-readable HTTPS URL.

The later migration should not change the provider-facing contract designed here: product-local references become short-lived HTTPS URLs. Only the URL resolver changes from the in-memory local token route to an object-storage signed URL resolver.
