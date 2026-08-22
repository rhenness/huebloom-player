import { useEffect, useRef, useState } from "react";

import {
  aggregateWaveformPeaks,
  parseWaveformData,
  type ParsedWaveformData,
} from "./waveform-data";

const wideTrackTableQuery = "(min-width: 901px)";

export interface TrackWaveformPreviewProps {
  title: string;
  waveformUrl: string;
}

export function TrackWaveformPreview({
  title,
  waveformUrl,
}: TrackWaveformPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [waveform, setWaveform] = useState<ParsedWaveformData | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia(wideTrackTableQuery);
    const updateVisibility = () => setIsVisible(mediaQuery.matches);
    updateVisibility();
    mediaQuery.addEventListener("change", updateVisibility);
    return () => mediaQuery.removeEventListener("change", updateVisibility);
  }, []);

  useEffect(() => {
    if (!isVisible) {
      setWaveform(null);
      return undefined;
    }

    const abortController = new AbortController();
    void fetch(waveformUrl, { signal: abortController.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Waveform request failed (${response.status}).`);
        }

        return parseWaveformData(await response.json());
      })
      .then((data) => {
        if (!abortController.signal.aborted) {
          setWaveform(data);
        }
      })
      .catch(() => {
        if (!abortController.signal.aborted) {
          setWaveform(null);
        }
      });

    return () => abortController.abort();
  }, [isVisible, waveformUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveform) {
      return;
    }

    const width = Math.max(1, Math.floor(canvas.clientWidth));
    const height = Math.max(1, Math.floor(canvas.clientHeight));
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.strokeStyle = "#7d8081";
    context.lineWidth = 1;
    const columns = aggregateWaveformPeaks(waveform.peaks, width);
    const center = height / 2;
    const amplitude = Math.max(1, center - 2);
    context.beginPath();

    for (let column = 0; column < width; column += 1) {
      const minimum = columns[column * 2];
      const maximum = columns[column * 2 + 1];
      context.moveTo(column + 0.5, center - maximum * amplitude);
      context.lineTo(column + 0.5, center - minimum * amplitude);
    }

    context.stroke();
  }, [waveform]);

  return (
    <span
      aria-label={`Waveform preview for ${title}`}
      className={`track-row__waveform${waveform ? " is-ready" : ""}`}
    >
      <canvas aria-hidden="true" ref={canvasRef} />
    </span>
  );
}