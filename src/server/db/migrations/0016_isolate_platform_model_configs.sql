INSERT INTO workspaces (id, name, owner_user_id, created_at, updated_at)
VALUES ('__platform__', 'Platform Model Credentials', NULL, datetime('now'), datetime('now'))
ON CONFLICT(id) DO NOTHING;

INSERT INTO model_credentials (
  id,
  workspace_id,
  credential_id,
  provider_id,
  model_kind,
  api_owner,
  encrypted_key,
  key_preview,
  name,
  vendor,
  base_url,
  api_mode,
  enabled,
  created_at,
  updated_at
)
SELECT
  'platform:' || id,
  '__platform__',
  credential_id,
  provider_id,
  model_kind,
  'platform',
  encrypted_key,
  key_preview,
  name,
  vendor,
  base_url,
  api_mode,
  enabled,
  created_at,
  updated_at
FROM model_credentials
WHERE workspace_id = 'default' AND api_owner = 'platform';

INSERT INTO model_variants (
  id,
  workspace_id,
  credential_id,
  provider_id,
  model_kind,
  api_owner,
  config_id,
  label,
  model,
  priority,
  task_scopes_json,
  tags_json,
  enabled,
  variant_order,
  created_at,
  updated_at
)
SELECT
  'platform:' || id,
  '__platform__',
  credential_id,
  provider_id,
  model_kind,
  'platform',
  config_id,
  label,
  model,
  priority,
  task_scopes_json,
  tags_json,
  enabled,
  variant_order,
  created_at,
  updated_at
FROM model_variants
WHERE workspace_id = 'default' AND api_owner = 'platform';

DELETE FROM model_variants
WHERE workspace_id = 'default' AND api_owner = 'platform';

DELETE FROM model_credentials
WHERE workspace_id = 'default' AND api_owner = 'platform';
