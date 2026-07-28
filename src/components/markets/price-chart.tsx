"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { cn } from "@/lib/utils";
import type { HistoryRange } from "@/lib/services/price-history.service";

const RANGES: { label: string; range: HistoryRange }[] = [
  { label: "1H", range: "1h" },
  { label: "6H", range: "6h" },
  { label: "24H", range: "24h" },
  { label: "7D", range: "7d" },
  { label: "30D", range: "30d" },
  { label: "ALL", range: "all" },
];

interface PricePoint {
  time: number;
  value: number;
}

export function PriceChart({ marketId, initialPoints }: { marketId: string; initialPoints: PricePoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [range, setRange] = useState<HistoryRange>("7d");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: isDark ? "#8b8f98" : "#6b7280",
      },
      grid: {
        vertLines: { color: isDark ? "#1b1d21" : "#eef0f2" },
        horzLines: { color: isDark ? "#1b1d21" : "#eef0f2" },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.15, bottom: 0.05 },
      },
      timeScale: { borderVisible: false },
      crosshair: { mode: 0 },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#5b6cff",
      topColor: "rgba(91, 108, 255, 0.28)",
      bottomColor: "rgba(91, 108, 255, 0.02)",
      lineWidth: 2,
      priceFormat: { type: "custom", formatter: (v: number) => `${Math.round(v * 100)}%` },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current) return;
    const data = initialPoints.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));
    seriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [initialPoints]);

  async function handleRangeChange(nextRange: HistoryRange) {
    setRange(nextRange);
    setLoading(true);
    try {
      const res = await fetch(`/api/markets/${marketId}/price-history?range=${nextRange}`);
      const json = await res.json();
      const points: PricePoint[] = json.points ?? [];
      seriesRef.current?.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
      chartRef.current?.timeScale().fitContent();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.range}
              onClick={() => handleRangeChange(r.range)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-hover",
                range === r.range && "bg-surface-hover text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        {loading && <span className="text-xs text-muted">Loading…</span>}
      </div>
      <div ref={containerRef} className="h-72 w-full" />
    </div>
  );
}
