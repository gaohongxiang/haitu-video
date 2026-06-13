import { describe, expect, it } from "vitest";

import {
  detectCompletedVideoJobTransitions,
  isActiveVideoJobStatus,
  isTerminalVideoJobStatus,
  type RefreshableVideoJob
} from "../../src/client/videoJobRefresh.js";

describe("video job refresh detection", () => {
  it("detects jobs that move from active queue states into terminal states", () => {
    const previous: RefreshableVideoJob[] = [
      { id: "job-a", status: "running", productSku: "SKU-A" },
      { id: "job-b", status: "queued", productSku: "SKU-B" },
      { id: "job-c", status: "completed", productSku: "SKU-C" }
    ];
    const next: RefreshableVideoJob[] = [
      { id: "job-a", status: "completed", productSku: "SKU-A" },
      { id: "job-b", status: "running", productSku: "SKU-B" },
      { id: "job-c", status: "completed", productSku: "SKU-C" }
    ];

    expect(detectCompletedVideoJobTransitions(previous, next)).toEqual({
      completedJobIds: ["job-a"],
      affectedProductSkus: ["SKU-A"]
    });
  });

  it("does not ask Product Studio to refresh for unchanged terminal jobs or newly discovered completed rows", () => {
    const previous: RefreshableVideoJob[] = [
      { id: "job-old", status: "completed", productSku: "SKU-OLD" }
    ];
    const next: RefreshableVideoJob[] = [
      { id: "job-old", status: "completed", productSku: "SKU-OLD" },
      { id: "job-new", status: "completed", productSku: "SKU-NEW" }
    ];

    expect(detectCompletedVideoJobTransitions(previous, next)).toEqual({
      completedJobIds: [],
      affectedProductSkus: []
    });
  });

  it("keeps status classification explicit for polling guards", () => {
    expect(isActiveVideoJobStatus("queued")).toBe(true);
    expect(isActiveVideoJobStatus("running")).toBe(true);
    expect(isActiveVideoJobStatus("completed")).toBe(false);
    expect(isTerminalVideoJobStatus("completed")).toBe(true);
    expect(isTerminalVideoJobStatus("failed")).toBe(true);
    expect(isTerminalVideoJobStatus("canceled")).toBe(true);
    expect(isTerminalVideoJobStatus("running")).toBe(false);
  });
});
