import type { VideoAspectRatio, VideoResolution } from "./types.js";

export const defaultVideoResolution: VideoResolution = "480p";
export const defaultVideoAspectRatio: VideoAspectRatio = "9:16";

export function normalizeVideoAspectRatio(value: unknown): VideoAspectRatio {
  return value === "16:9" ? "16:9" : defaultVideoAspectRatio;
}

export function videoDimensionsFor(input: {
  resolution?: VideoResolution;
  aspectRatio?: VideoAspectRatio;
}): { width: number; height: number } {
  const [shortEdge, longEdge] = videoEdgesForResolution(input.resolution);
  return normalizeVideoAspectRatio(input.aspectRatio) === "16:9"
    ? { width: longEdge, height: shortEdge }
    : { width: shortEdge, height: longEdge };
}

export function videoPixelArea(input: {
  resolution?: VideoResolution;
  aspectRatio?: VideoAspectRatio;
}): number {
  const dimensions = videoDimensionsFor(input);
  return dimensions.width * dimensions.height;
}

function videoEdgesForResolution(resolution?: VideoResolution): [number, number] {
  if (resolution === "720p") return [720, 1280];
  if (resolution === "1080p") return [1080, 1920];
  if (resolution === "4k") return [2160, 3840];
  return [480, 896];
}
