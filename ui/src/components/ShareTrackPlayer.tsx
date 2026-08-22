import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

import {
  clamp,
  formatTime,
  fromMediaVolume,
  MAX_MEDIA_VOLUME,
  rangeFillStyle,
  toMediaVolume,
} from "./audio-controls";
import { IconButton } from "./IconButton";
import { WaveformScrubber } from "./WaveformScrubber";

export interface ShareTrackPlayerProps {
  src: string;
  trackTitle: string;
  waveformUrl: string;
}

function mediaDuration(audio: HTMLAudioElement): number {
  return Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
}

function playbackErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Playback was blocked by the browser. Press play to try again.";
  }

  return "This track could not be played. Check the media connection and try again.";
}

/** A standalone custom player for one public shared track. */
export function ShareTrackPlayer({
  src,
  trackTitle,
  waveformUrl,
}: ShareTrackPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const safeCurrentTime = clamp(currentTime, 0, safeDuration || 0);
  const safeVolume = clamp(volume, 0, 1);
  const progressFill = rangeFillStyle(safeCurrentTime, safeDuration);
  const volumeFill = rangeFillStyle(muted ? 0 : safeVolume, 1);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setPlaybackError(null);
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = toMediaVolume(volume);
      audio.muted = muted;
    }
  }, [muted, volume]);

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (!audio.paused) {
      audio.pause();
      return;
    }

    if (audio.ended) {
      try {
        audio.currentTime = 0;
        setCurrentTime(0);
      } catch {
        // The browser will keep the current position until metadata is ready.
      }
    }

    try {
      await audio.play();
      setPlaybackError(null);
    } catch (error) {
      setIsPlaying(false);
      setPlaybackError(playbackErrorMessage(error));
    }
  }

  function seekTo(time: number) {
    const audio = audioRef.current;
    const nextTime = clamp(time, 0, safeDuration);

    if (!audio || safeDuration === 0) {
      return;
    }

    try {
      audio.currentTime = nextTime;
      setCurrentTime(nextTime);
    } catch {
      // A seek can be rejected while the metadata is still becoming available.
    }
  }

  function setAudioVolume(nextVolume: number) {
    const audio = audioRef.current;
    const next = clamp(nextVolume, 0, 1);

    if (audio) {
      audio.volume = toMediaVolume(next);
      audio.muted = false;
    }

    setVolume(next);
    setMuted(false);
  }

  function toggleMuted() {
    const audio = audioRef.current;
    const nextMuted = !muted;

    if (audio) {
      audio.muted = nextMuted;
    }

    setMuted(nextMuted);
  }

  return (
    <section aria-label={`Player for ${trackTitle}`} className="share-track-player">
      <audio
        aria-hidden="true"
        className="share-track-player__audio"
        key={src}
        onDurationChange={(event) => setDuration(mediaDuration(event.currentTarget))}
        onEnded={(event) => {
          setIsPlaying(false);
          setCurrentTime(mediaDuration(event.currentTarget));
        }}
        onError={() => {
          setIsPlaying(false);
          setPlaybackError("This track could not be played. Check the media connection and try again.");
        }}
        onLoadedMetadata={(event) => setDuration(mediaDuration(event.currentTarget))}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onVolumeChange={(event) => {
          const audio = event.currentTarget;
          const cappedVolume = Math.min(audio.volume, MAX_MEDIA_VOLUME);
          if (audio.volume !== cappedVolume) {
            audio.volume = cappedVolume;
          }

          setMuted(audio.muted);
          setVolume(fromMediaVolume(cappedVolume));
        }}
        preload="metadata"
        ref={audioRef}
        src={src}
      >
        Your browser does not support audio playback.
      </audio>

      <IconButton
        active={isPlaying}
        className="share-track-player__play-button"
        icon={
          isPlaying ? (
            <Pause aria-hidden="true" fill="currentColor" size={25} strokeWidth={1.8} />
          ) : (
            <Play aria-hidden="true" fill="currentColor" size={26} strokeWidth={1.8} />
          )
        }
        label={isPlaying ? `Pause ${trackTitle}` : `Play ${trackTitle}`}
        onClick={togglePlay}
        size="large"
      />

      <div className="share-track-player__progress">
        <time dateTime={`PT${Math.floor(safeCurrentTime)}S`}>{formatTime(safeCurrentTime)}</time>
        <WaveformScrubber
          audioRef={audioRef}
          currentTime={safeCurrentTime}
          disabled={safeDuration === 0}
          duration={safeDuration}
          fillStyle={progressFill}
          label="Playback position"
          onSeek={seekTo}
          waveformUrl={waveformUrl}
        />
        <time dateTime={`PT${Math.floor(safeDuration)}S`}>{formatTime(safeDuration)}</time>
      </div>

      <div aria-label="Volume controls" className="share-track-player__volume" role="group">
        <IconButton
          active={muted || safeVolume === 0}
          icon={
            muted || safeVolume === 0 ? (
              <VolumeX aria-hidden="true" size={20} strokeWidth={1.9} />
            ) : (
              <Volume2 aria-hidden="true" size={20} strokeWidth={1.9} />
            )
          }
          label={muted ? "Unmute" : "Mute"}
          onClick={toggleMuted}
          size="small"
        />
        <input
          aria-label="Volume"
          aria-valuetext={`${Math.round((muted ? 0 : safeVolume) * 100)}% volume`}
          className="range-input range-input--volume"
          max="1"
          min="0"
          onChange={(event) => setAudioVolume(Number(event.currentTarget.value))}
          step="0.01"
          style={volumeFill}
          type="range"
          value={muted ? 0 : safeVolume}
        />
      </div>

      {playbackError ? (
        <p className="share-track-player__error" role="alert">
          {playbackError}
        </p>
      ) : null}
    </section>
  );
}
