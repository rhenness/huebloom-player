import {
  Pause,
  Play,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";

import { clamp, formatTime, rangeFillStyle } from "./audio-controls";
import { DefaultArtwork } from "./DefaultArtwork";
import { IconButton } from "./IconButton";
import type { PlayerAction, PlayerTrack } from "./view-models";

export { formatTime };

export interface PlayerBarProps {
  track?: PlayerTrack | null;
  isPlaying: boolean;
  shuffleEnabled: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  disablePrevious?: boolean;
  disableNext?: boolean;
  onTogglePlay: PlayerAction;
  onPrevious: PlayerAction;
  onNext: PlayerAction;
  onToggleShuffle: PlayerAction;
  onSeek: (time: number) => void;
  onSetVolume: (volume: number) => void;
  onToggleMute: PlayerAction;
  className?: string;
}

/**
 * The persistent, custom player surface. It receives values and actions from
 * its parent and deliberately does not own an HTMLAudioElement or a store.
 */
export function PlayerBar({
  className,
  currentTime,
  disableNext = false,
  disablePrevious = false,
  duration,
  isPlaying,
  muted,
  onNext,
  onPrevious,
  onSeek,
  onSetVolume,
  onToggleMute,
  onTogglePlay,
  onToggleShuffle,
  shuffleEnabled,
  track,
  volume,
}: PlayerBarProps) {
  const hasTrack = Boolean(track);
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const safeCurrentTime = clamp(currentTime, 0, safeDuration || 0);
  const safeVolume = clamp(volume, 0, 1);
  const progressFillStyle = rangeFillStyle(safeCurrentTime, safeDuration);
  const volumeFillStyle = rangeFillStyle(muted ? 0 : safeVolume, 1);
  return (
    <section
      aria-label="Music player"
      className={["player-bar", className].filter(Boolean).join(" ")}
    >
      <div className="player-bar__track">
        <div aria-hidden="true" className="player-bar__artwork">
          <DefaultArtwork size={60} />
        </div>
        <div className="player-bar__track-copy">
          <p className="player-bar__track-title" title={track?.title}>
            {track?.title ?? "Nothing playing"}
          </p>
          <p className="player-bar__track-file" title={track?.filename}>
            {track?.filename ?? "Select a track to start listening"}
          </p>
        </div>
      </div>

      <div className="player-bar__center">
        <div aria-label="Playback controls" className="player-bar__transport" role="group">
          <IconButton
            active={shuffleEnabled}
            disabled={!hasTrack}
            icon={<Shuffle aria-hidden="true" size={19} strokeWidth={2} />}
            label={shuffleEnabled ? "Turn shuffle off" : "Turn shuffle on"}
            onClick={onToggleShuffle}
            size="small"
          />
          <IconButton
            disabled={!hasTrack || disablePrevious}
            icon={<SkipBack aria-hidden="true" size={23} fill="currentColor" strokeWidth={1.8} />}
            label="Previous track"
            onClick={onPrevious}
          />
          <IconButton
            className="player-bar__play-button"
            disabled={!hasTrack}
            icon={
              isPlaying ? (
                <Pause aria-hidden="true" size={28} fill="currentColor" strokeWidth={1.8} />
              ) : (
                <Play aria-hidden="true" size={29} fill="currentColor" strokeWidth={1.8} />
              )
            }
            label={isPlaying ? "Pause" : "Play"}
            onClick={onTogglePlay}
            size="large"
          />
          <IconButton
            disabled={!hasTrack || disableNext}
            icon={<SkipForward aria-hidden="true" size={23} fill="currentColor" strokeWidth={1.8} />}
            label="Next track"
            onClick={onNext}
          />
        </div>

        <div className="player-bar__progress">
          <time className="player-bar__time" dateTime={`PT${Math.floor(safeCurrentTime)}S`}>
            {formatTime(safeCurrentTime)}
          </time>
          <input
            aria-label="Playback position"
            className="range-input range-input--progress"
            disabled={!hasTrack || safeDuration === 0}
            max={safeDuration || 1}
            min="0"
            onChange={(event) => onSeek(Number(event.currentTarget.value))}
            step="0.1"
            style={progressFillStyle}
            type="range"
            value={safeCurrentTime}
          />
          <time className="player-bar__time" dateTime={`PT${Math.floor(safeDuration)}S`}>
            {formatTime(safeDuration)}
          </time>
        </div>
      </div>

      <div className="player-bar__utility">
        <div aria-label="Volume controls" className="player-bar__volume" role="group">
          <IconButton
            active={muted || safeVolume === 0}
            icon={
              muted || safeVolume === 0 ? (
                <VolumeX aria-hidden="true" size={23} strokeWidth={1.9} />
              ) : (
                <Volume2 aria-hidden="true" size={23} strokeWidth={1.9} />
              )
            }
            label={muted ? "Unmute" : "Mute"}
            onClick={onToggleMute}
          />
          <input
            aria-label="Volume"
            className="range-input range-input--volume"
            max="1"
            min="0"
            onChange={(event) => onSetVolume(Number(event.currentTarget.value))}
            step="0.01"
            style={volumeFillStyle}
            type="range"
            value={muted ? 0 : safeVolume}
          />
        </div>
      </div>
    </section>
  );
}
