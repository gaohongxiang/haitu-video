import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { VideoProvider, VideoProviderRequest, VideoProviderResult } from "./types.js";
import { videoDimensionsFor } from "./videoGeometry.js";

export class MockVideoProvider implements VideoProvider {
  async generateVideo(request: VideoProviderRequest): Promise<VideoProviderResult> {
    await mkdir(request.outputDir, { recursive: true });
    const outputPath = join(request.outputDir, `${request.jobId}.mock-video.txt`);
    await writeFile(
      outputPath,
      [
        `Mock Haitu video output`,
        `jobId=${request.jobId}`,
        `sku=${request.productSku}`,
        `duration=${request.durationSeconds}`,
        `aspectRatio=${request.aspectRatio}`,
        `script=${request.script}`,
        `prompt=${request.prompt}`
      ].join("\n"),
      "utf8"
    );
    const dimensions = videoDimensionsFor({
      resolution: request.resolution,
      aspectRatio: request.aspectRatio
    });

    return {
      provider: "mock",
      model: "mock-local-placeholder",
      output: {
        path: outputPath,
        width: dimensions.width,
        height: dimensions.height,
        durationSeconds: request.durationSeconds,
        mimeType: "text/plain"
      },
      cost: {
        amount: 0,
        currency: "USD"
      },
      rawResponse: {
        localPlaceholder: true,
        outputPath
      }
    };
  }
}
