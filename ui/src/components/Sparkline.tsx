import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

export function Sparkline({
  values,
  width = 220,
  height = 24,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const xs: number[] = values.map((_, i) => i);
    const ys: number[] = values.length ? values : [0];
    if (xs.length === 0) xs.push(0);

    const opts: uPlot.Options = {
      width,
      height,
      cursor: { show: false },
      legend: { show: false },
      scales: {
        x: { time: false },
        y: { auto: true },
      },
      axes: [
        { show: false },
        { show: false },
      ],
      series: [
        {},
        {
          stroke: getCss("--text-muted") || "#888",
          fill: hexToRgba(getCss("--accent") || "#0066cc", 0.10),
          width: 1,
          points: { show: false },
        },
      ],
      padding: [2, 2, 2, 2],
    };

    if (plotRef.current) {
      plotRef.current.destroy();
    }
    plotRef.current = new uPlot(opts, [xs, ys], ref.current);

    return () => {
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [values, width, height]);

  return <div ref={ref} />;
}

function getCss(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return `rgba(0,102,204,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff},${alpha})`;
}
