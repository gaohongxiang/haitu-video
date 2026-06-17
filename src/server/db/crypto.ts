import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ENCRYPTION_VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function encryptSecret(plaintext: string, secretKey: string): string {
  const normalized = normalizeSecret(plaintext, "plaintext secret");
  const key = deriveEncryptionKey(secretKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  const ciphertext = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(":");
}

export function decryptSecret(encrypted: string, secretKey: string): string {
  const [version, ivText, tagText, ciphertextText] = encrypted.split(":");
  if (version !== ENCRYPTION_VERSION || !ivText || !tagText || !ciphertextText) {
    throw new Error("Unsupported encrypted secret format.");
  }
  const key = deriveEncryptionKey(secretKey);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivText, "base64url"), {
    authTagLength: TAG_BYTES
  });
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function resolveDatabaseSecretKey(env: NodeJS.ProcessEnv = process.env): string {
  const secretKey = env.HAITU_SECRET_KEY;
  if (!secretKey || secretKey.length < 32) {
    throw new Error("HAITU_SECRET_KEY must be at least 32 bytes long.");
  }
  return secretKey;
}

function deriveEncryptionKey(secretKey: string): Buffer {
  const normalized = normalizeSecret(secretKey, "HAITU_SECRET_KEY");
  if (Buffer.byteLength(normalized, "utf8") < 32) {
    throw new Error("HAITU_SECRET_KEY must be at least 32 bytes long.");
  }
  return createHash("sha256").update(normalized, "utf8").digest();
}

function normalizeSecret(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}
