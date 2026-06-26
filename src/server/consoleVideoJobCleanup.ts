import { rm } from "node:fs/promises";
import { join } from "node:path";

export async function removeGeneratedVideoJobOutputs(outDir: string): Promise<void> {
  await Promise.all([
    rm(join(outDir, "raw"), { recursive: true, force: true }),
    rm(join(outDir, "final"), { recursive: true, force: true }),
    rm(join(outDir, "make-video-report.json"), { force: true })
  ]);
}
