/**
 * Minimal view models used by the presentational components.
 *
 * They intentionally mirror the browser library schema without importing the
 * player store, so a parent can pass its domain objects directly.
 */
export interface FolderNavigationItem {
  id: string;
  name: string;
  /** A Folder from the library schema can be passed directly. */
  tracks?: readonly unknown[];
  /** Use this when the caller has a count but does not pass tracks. */
  trackCount?: number;
}

export interface TrackItem {
  audioPath: string;
  title: string;
  filename: string;
  isFavorite?: boolean;
  shareId?: string;
  folderId?: string;
  folderName?: string;
}

export type PlayerTrack = Pick<TrackItem, "audioPath" | "title" | "filename">;

export type PlayerAction = () => void;
