import type { EChartsOption } from "echarts";

import type { DashboardProviderRow, DashboardRecentRow, DashboardTrendPoint } from "./dashboardAnalytics.js";

const chartPalette = ["#6f442c", "#0aa394", "#c65a36", "#b7791f", "#d87955", "#738a66"];
const chartAxisColor = "#8a7665";
const chartGridLineColor = "#ead7c4";

export function buildProviderChartOption(rows: DashboardProviderRow[]): EChartsOption {
  return {
    color: chartPalette,
    tooltip: {
      trigger: "item",
      formatter: "{b}: {c} 次 ({d}%)"
    },
    legend: {
      bottom: 0,
      left: "center",
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: chartAxisColor, fontSize: 11 }
    },
    series: [
      {
        name: "模型分布",
        type: "pie",
        radius: ["58%", "76%"],
        center: ["50%", "44%"],
        avoidLabelOverlap: true,
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 12, fontWeight: 700 }
        },
        data: rows.map((row) => ({
          name: row.name,
          value: row.jobs
        }))
      }
    ]
  };
}

export function buildTrendChartOption(points: DashboardTrendPoint[]): EChartsOption {
  return {
    color: ["#6f442c", "#0aa394", "#c65a36"],
    tooltip: { trigger: "axis" },
    legend: {
      top: 0,
      right: 8,
      textStyle: { color: chartAxisColor, fontSize: 12 }
    },
    grid: { top: 46, right: 48, bottom: 54, left: 48 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: points.map((point) => point.label),
      axisLabel: { color: chartAxisColor, rotate: 36, fontSize: 10 },
      axisLine: { lineStyle: { color: chartGridLineColor } }
    },
    yAxis: [
      {
        type: "value",
        name: "Token",
        axisLabel: { color: chartAxisColor, formatter: (value: number) => formatCompactNumber(value) },
        splitLine: { lineStyle: { color: chartGridLineColor } }
      },
      {
        type: "value",
        name: "¥",
        axisLabel: { color: chartAxisColor, formatter: (value: number) => `¥${value}` },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: "Token",
        type: "line",
        smooth: true,
        symbolSize: 6,
        areaStyle: { opacity: 0.08 },
        data: points.map((point) => point.totalTokens)
      },
      {
        name: "任务",
        type: "bar",
        barWidth: 12,
        yAxisIndex: 1,
        data: points.map((point) => point.jobs)
      },
      {
        name: "成本",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 6,
        data: points.map((point) => point.estimatedCostCny)
      }
    ]
  };
}

export function buildRecentChartOption(rows: DashboardRecentRow[]): EChartsOption {
  const ordered = [...rows].reverse();
  return {
    color: ["#6f442c", "#c65a36"],
    tooltip: { trigger: "axis" },
    legend: {
      top: 0,
      right: 8,
      textStyle: { color: chartAxisColor, fontSize: 12 }
    },
    grid: { top: 46, right: 48, bottom: 54, left: 52 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: ordered.map((row) => row.label),
      axisLabel: { color: chartAxisColor, rotate: 28, fontSize: 10 },
      axisLine: { lineStyle: { color: chartGridLineColor } }
    },
    yAxis: [
      {
        type: "value",
        axisLabel: { color: chartAxisColor, formatter: (value: number) => formatCompactNumber(value) },
        splitLine: { lineStyle: { color: chartGridLineColor } }
      },
      {
        type: "value",
        axisLabel: { color: chartAxisColor, formatter: (value: number) => `¥${value}` },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: "Token",
        type: "line",
        smooth: true,
        symbolSize: 6,
        data: ordered.map((row) => row.totalTokens)
      },
      {
        name: "成本",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 6,
        data: ordered.map((row) => row.estimatedCostCny)
      }
    ]
  };
}

function formatCompactNumber(value?: number): string {
  const amount = Number(value || 0);
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return formatNumber(amount);
}

function formatNumber(value?: number | string): string {
  if (value === undefined || value === null || value === "") return "-";
  return Number(value).toLocaleString("zh-CN");
}
