import type { CSSProperties } from "react";

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);
}

type RangeFillStyle = CSSProperties & {
  "--range-fill": string;
};

/** Supplies the dynamic fill amount used by the custom range controls. */
export function rangeFillStyle(value: number, max: number): RangeFillStyle {
  const percentage = max > 0 ? (clamp(value, 0, max) / max) * 100 : 0;

  return { "--range-fill": `${percentage}%` };
}

/** Formats a media time for the custom transport controls. */
export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const roundedSeconds = Math.floor(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = String(roundedSeconds % 60).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}
