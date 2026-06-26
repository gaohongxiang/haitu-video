import { readFile } from "node:fs/promises";

import { normalizeJapaneseHashtags } from "../core/japaneseHashtags.js";

export interface JobContentReviewSnapshot {
  available: boolean;
  scriptVoiceover?: string;
  subtitleLines: string[];
  cta?: string;
  hashtags: string[];
  promptPreview?: string;
  rawManifestUrl?: string;
  finalManifestUrl?: string;
  subtitleUrl?: string;
  missingReason?: string;
}

export async function buildContentReviewSnapshot(input: {
  rawManifestPath?: string;
  finalManifestPath?: string;
  finalSubtitlePath?: string;
}): Promise<JobContentReviewSnapshot> {
  const links = {
    rawManifestUrl: input.rawManifestPath ? mediaUrl(input.rawManifestPath) : undefined,
    finalManifestUrl: input.finalManifestPath ? mediaUrl(input.finalManifestPath) : undefined,
    subtitleUrl: input.finalSubtitlePath ? mediaUrl(input.finalSubtitlePath) : undefined
  };
  if (!input.rawManifestPath) {
    return {
      available: false,
      subtitleLines: [],
      hashtags: [],
      ...links,
      missingReason: "raw manifest 缺失，无法读取脚本和 prompt"
    };
  }
  try {
    const manifest = JSON.parse(await readFile(input.rawManifestPath, "utf8")) as {
      script?: {
        voiceover?: unknown;
        subtitleLines?: unknown;
        cta?: unknown;
      };
      hashtags?: unknown;
      prompt?: unknown;
    };
    const scriptVoiceover = asText(manifest.script?.voiceover);
    const subtitleLines = Array.isArray(manifest.script?.subtitleLines)
      ? manifest.script.subtitleLines.map((line) => asText(line)).filter(isNonEmptyString)
      : [];
    const promptPreview = truncateText(asText(manifest.prompt), 320);
    const cta = asText(manifest.script?.cta);
    return {
      available: Boolean(scriptVoiceover || subtitleLines.length || promptPreview),
      scriptVoiceover,
      subtitleLines,
      cta,
      hashtags: normalizeJapaneseHashtags(manifest.hashtags),
      promptPreview,
      ...links,
      missingReason: undefined
    };
  } catch {
    return {
      available: false,
      subtitleLines: [],
      hashtags: [],
      ...links,
      missingReason: `raw manifest 无法读取: ${input.rawManifestPath}`
    };
  }
}

function mediaUrl(path: string): string {
  return `/media?path=${encodeURIComponent(path)}`;
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function truncateText(value: string | undefined, maxLength: number): string | undefined {
  if (!value || value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}
