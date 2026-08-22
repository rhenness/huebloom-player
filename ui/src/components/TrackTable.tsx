import { AudioLines, Check, Play, Share2, Star, TriangleAlert } from "lucide-react";

import { IconButton } from "./IconButton";
import { TrackWaveformPreview } from "./TrackWaveformPreview";
import type { TrackItem } from "./view-models";

export interface TrackRowProps<TTrack extends TrackItem = TrackItem> {
  track: TTrack;
  isActive?: boolean;
  isPlaying?: boolean;
  showFolder?: boolean;
  waveformUrl?: string;
  onSelect: (track: TTrack) => void;
  onCopyShareLink?: (track: TTrack) => void;
  shareLinkCopied?: boolean;
}

/** A keyboard-accessible track selection row. */
export function TrackRow<TTrack extends TrackItem>({
  isActive = false,
  isPlaying = false,
  onCopyShareLink,
  onSelect,
  shareLinkCopied = false,
  showFolder = false,
  track,
  waveformUrl,
}: TrackRowProps<TTrack>) {
  const selectionLabel = isActive
    ? `${track.title}, currently selected${isPlaying ? " and playing" : ""}`
    : `Play ${track.title}`;
  const hasShareAction = Boolean(track.shareId && onCopyShareLink);

  return (
    <li
      className={`track-row${isActive ? " is-active" : ""}${isPlaying ? " is-playing" : ""}${hasShareAction ? " has-share-action" : ""}`}
    >
      <button
        aria-current={isActive ? "true" : undefined}
        aria-label={selectionLabel}
        className="track-row__button"
        onClick={() => onSelect(track)}
        type="button"
      >
        <span aria-hidden="true" className="track-row__indicator">
          {isActive && isPlaying ? (
            <AudioLines className="track-row__playing-icon" size={22} strokeWidth={1.9} />
          ) : (
            <Play size={20} strokeWidth={1.9} />
          )}
        </span>
        <span className="track-row__title" title={track.title}>
          {track.title}
        </span>
        {showFolder ? (
          <span className="track-row__folder" title={track.folderName}>
            {track.folderName}
          </span>
        ) : null}
        {waveformUrl ? (
          <TrackWaveformPreview title={track.title} waveformUrl={waveformUrl} />
        ) : null}
        <span
          aria-label={track.isFavorite ? "Favorite track" : "Not favorited"}
          className={`track-row__favorite${track.isFavorite ? " is-favorite" : ""}`}
        >
          <Star
            aria-hidden="true"
            fill={track.isFavorite ? "currentColor" : "none"}
            size={21}
            strokeWidth={1.8}
          />
        </span>
      </button>
      {hasShareAction ? (
        <IconButton
          className={`track-row__share${shareLinkCopied ? " is-copied" : ""}`}
          icon={
            shareLinkCopied ? (
              <Check aria-hidden="true" size={17} strokeWidth={2.3} />
            ) : (
              <Share2 aria-hidden="true" size={17} strokeWidth={1.9} />
            )
          }
          label={shareLinkCopied ? "Share link copied" : `Copy link for ${track.title}`}
          onClick={() => onCopyShareLink!(track)}
          size="small"
        />
      ) : null}
    </li>
  );
}

export interface TrackTableProps<TTrack extends TrackItem = TrackItem> {
  folderName?: string | null;
  tracks: readonly TTrack[];
  activeTrackPath?: string | null;
  isPlaying?: boolean;
  isLoading?: boolean;
  showFolder?: boolean;
  error?: string | null;
  emptyMessage?: string;
  onSelectTrack: (track: TTrack) => void;
  onCopyShareLink?: (track: TTrack) => void;
  copiedShareId?: string | null;
  getWaveformUrl?: (track: TTrack) => string;
  className?: string;
}

function trackCountLabel(trackCount: number) {
  return `${trackCount} ${trackCount === 1 ? "track" : "tracks"}`;
}

/**
 * A visual table backed by a native list of buttons, so every row remains a
 * first-class keyboard control instead of relying on clickable table rows.
 */
export function TrackTable<TTrack extends TrackItem>({
  activeTrackPath,
  className,
  emptyMessage = "This folder does not contain any tracks yet.",
  error,
  folderName,
  isLoading = false,
  isPlaying = false,
  copiedShareId = null,
  getWaveformUrl,
  onCopyShareLink,
  onSelectTrack,
  showFolder = false,
  tracks,
}: TrackTableProps<TTrack>) {
  const title = folderName || "Library";
  const showShareAction = Boolean(onCopyShareLink);

  return (
    <section
      aria-labelledby="track-table-heading"
      className={[
        "track-table-panel",
        showFolder ? "track-table-panel--with-folder" : "",
        showShareAction ? "track-table-panel--with-share" : "",
        getWaveformUrl ? "track-table-panel--with-waveform" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="track-table-panel__header">
        <h1 id="track-table-heading">{title}</h1>
        <p className="track-table-panel__count">{trackCountLabel(tracks.length)}</p>
      </header>

      {error ? (
        <div className="track-table__state track-table__state--error" role="alert">
          <TriangleAlert aria-hidden="true" size={23} />
          <p>{error}</p>
        </div>
      ) : isLoading ? (
        <div className="track-table__state" role="status">
          <span aria-hidden="true" className="track-table__loading-dot" />
          <p>Loading tracks…</p>
        </div>
      ) : tracks.length === 0 ? (
        <div className="track-table__state">
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <ul aria-label={`${title} tracks`} className="track-table__list">
          {tracks.map((track) => (
            <TrackRow
              key={track.audioPath}
              isActive={track.audioPath === activeTrackPath}
              isPlaying={isPlaying && track.audioPath === activeTrackPath}
              onCopyShareLink={onCopyShareLink}
              onSelect={onSelectTrack}
              shareLinkCopied={track.shareId === copiedShareId}
              showFolder={showFolder}
              track={track}
              waveformUrl={getWaveformUrl?.(track)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
