import { describe, expect, it } from "vitest";

import {
  buildProviderChartOption,
  buildRecentChartOption,
  buildTrendChartOption
} from "../../src/client/dashboardChartOptions.js";
import type { DashboardProviderRow, DashboardRecentRow, DashboardTrendPoint } from "../../src/client/dashboardAnalytics.js";

describe("dashboard chart option builders", () => {
  it("builds provider, trend, and recent chart options without changing dashboard data semantics", () => {
    const providerRows: DashboardProviderRow[] = [
      { name: "seedance", jobs: 3, completed: 2, active: 1, totalTokens: 1200, estimatedCostCny: 4.5 },
      { name: "mock", jobs: 1, completed: 1, active: 0, totalTokens: 0, estimatedCostCny: 0 }
    ];
    const trendPoints: DashboardTrendPoint[] = [
      { label: "06-25 10:00", jobs: 2, totalTokens: 1500, estimatedCostCny: 3.25 },
      { label: "06-25 11:00", jobs: 1, totalTokens: 2500000, estimatedCostCny: 8 }
    ];
    const recentRows: DashboardRecentRow[] = [
      { id: "job-new", label: "06-25 11:00", productSku: "SKU-2", provider: "seedance", status: "completed", totalTokens: 2000, estimatedCostCny: 2 },
      { id: "job-old", label: "06-25 10:00", productSku: "SKU-1", provider: "mock", status: "completed", totalTokens: 1000, estimatedCostCny: 1 }
    ];

    const providerOption = buildProviderChartOption(providerRows);
    const trendOption = buildTrendChartOption(trendPoints);
    const recentOption = buildRecentChartOption(recentRows);

    expect(providerOption.series).toMatchObject([
      {
        name: "模型分布",
        type: "pie",
        radius: ["58%", "76%"],
        data: [
          { name: "seedance", value: 3 },
          { name: "mock", value: 1 }
        ]
      }
    ]);
    expect(trendOption.xAxis).toMatchObject({ data: ["06-25 10:00", "06-25 11:00"] });
    expect(trendOption.series).toMatchObject([
      { name: "Token", type: "line", data: [1500, 2500000] },
      { name: "任务", type: "bar", yAxisIndex: 1, data: [2, 1] },
      { name: "成本", type: "line", yAxisIndex: 1, data: [3.25, 8] }
    ]);
    expect(recentOption.xAxis).toMatchObject({ data: ["06-25 10:00", "06-25 11:00"] });
    expect(recentOption.series).toMatchObject([
      { name: "Token", data: [1000, 2000] },
      { name: "成本", yAxisIndex: 1, data: [1, 2] }
    ]);
  });

  it("keeps compact number and currency axis formatters stable", () => {
    const option = buildTrendChartOption([
      { label: "06-25", jobs: 1, totalTokens: 1_500_000, estimatedCostCny: 6 }
    ]);
    const yAxes = option.yAxis as Array<{ axisLabel?: { formatter?: (value: number) => string } }>;

    expect(yAxes[0]?.axisLabel?.formatter?.(999)).toBe("999");
    expect(yAxes[0]?.axisLabel?.formatter?.(1500)).toBe("1.5K");
    expect(yAxes[0]?.axisLabel?.formatter?.(1_500_000)).toBe("1.50M");
    expect(yAxes[1]?.axisLabel?.formatter?.(6)).toBe("¥6");
  });
});
