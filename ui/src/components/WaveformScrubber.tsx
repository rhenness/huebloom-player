import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import WaveSurfer from "wavesurfer.js";

import { formatTime } from "./audio-controls";
import { parseWaveformData } from "./waveform-data";

type WaveformStatus = "loading" | "ready" | "fallback";

export interface WaveformScrubberProps {
  audioRef: RefObject<HTMLAudioElement | null>;
  currentTime: number;
  disabled: boolean;
  duration: number;
  fillStyle: CSSProperties;
  label: string;
  onSeek: (time: number) => void;
  waveformUrl: string;
}

export function WaveformScrubber({
  audioRef,
  currentTime,
  disabled,
  duration,
  fillStyle,
  label,
  onSeek,
  waveformUrl,
}: WaveformScrubberProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onSeekRef = useRef(onSeek);
  const [status, setStatus] = useState<WaveformStatus>("loading");

  useEffect(() => {
    onSeekRef.current = onSeek;
  }, [onSeek]);

  useEffect(() => {
    const container = containerRef.current;
    const audio = audioRef.current;
    const abortController = new AbortController();
    let waveSurfer: WaveSurfer | null = null;

    if (!container || !audio || !waveformUrl) {
      setStatus("fallback");
      return () => abortController.abort();
    }

    setStatus("loading");

    void fetch(waveformUrl, { signal: abortController.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Waveform request failed (${response.status}).`);
        }

        return parseWaveformData(await response.json());
      })
      .then((waveform) => {
        if (abortController.signal.aborted) {
          return;
        }

        waveSurfer = WaveSurfer.create({
          autoCenter: false,
          autoScroll: false,
          barGap: 2,
          barRadius: 2,
          barWidth: 2,
          container,
          cursorColor: "#1e427e",
          cursorWidth: 1,
          duration: waveform.duration,
          dragToSeek: true,
          fillParent: true,
          height: "auto",
          interact: true,
          media: audio,
          normalize: false,
          peaks: [waveform.peaks],
          progressColor: "#315fa8",
          waveColor: "#85888a",
        });
        waveSurfer.on("interaction", (time) => onSeekRef.current(time));
        waveSurfer.on("ready", () => setStatus("ready"));
        waveSurfer.on("error", () => setStatus("fallback"));
      })
      .catch((error: unknown) => {
        if (
          !abortController.signal.aborted &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          setStatus("fallback");
        }
      });

    return () => {
      abortController.abort();
      waveSurfer?.destroy();
    };
  }, [audioRef, waveformUrl]);

  return (
    <div className={`waveform-scrubber is-${status}`}>
      <div aria-hidden="true" className="waveform-scrubber__canvas" ref={containerRef} />
      <input
        aria-label={label}
        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
        className="range-input range-input--progress waveform-scrubber__input"
        disabled={disabled}
        max={duration || 1}
        min="0"
        onChange={(event) => onSeek(Number(event.currentTarget.value))}
        step="0.1"
        style={fillStyle}
        type="range"
        value={currentTime}
      />
    </div>
  );
}