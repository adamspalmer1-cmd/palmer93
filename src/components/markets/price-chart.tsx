"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  AreaSeries,
  LineSeries,
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

interface PriceChartProps {
  marketId: string;
  initialPoints: PricePoint[];
  /**
   * Claude's fair-value estimate (base case) at each historical analysis,
   * rendered as a second, distinctly-styled/labeled series — never merged
   * with or mistaken for the actual market price series.
   */
  fairValuePoints?: PricePoint[];
}

export function PriceChart({ marketId, initialPoints, fairValuePoints = [] }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const fairValueSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
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

    const fairValueSeries = chart.addSeries(LineSeries, {
      color: "#f5a623",
      lineWidth: 2,
      lineStyle: 2, // dashed — visually distinct from the solid market-price area
      pointMarkersVisible: true,
      priceFormat: { type: "custom", formatter: (v: number) => `${Math.round(v * 100)}%` },
      title: "Claude fair value",
    });

    chartRef.current = chart;
    seriesRef.current = series;
    fairValueSeriesRef.current = fairValueSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      fairValueSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current) return;
    const data = initialPoints.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));
    seriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [initialPoints]);

  useEffect(() => {
    if (!fairValueSeriesRef.current) return;
    const data = fairValuePoints.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));
    fairValueSeriesRef.current.setData(data);
    if (data.length > 0) chartRef.current?.timeScale().fitContent();
  }, [fairValuePoints]);

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
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
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
        <div className="flex items-center gap-3 text-xs text-muted">
          {fairValuePoints.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded-full bg-accent" /> Market price
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded-full bg-[#f5a623]" /> Claude fair value estimate
              </span>
            </div>
          )}
          {loading && <span>Loading…</span>}
        </div>
      </div>
      <div ref={containerRef} className="h-72 w-full" />
    </div>
  );
}
