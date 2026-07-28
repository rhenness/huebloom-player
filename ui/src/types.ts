/**
 * Browser-facing catalog types.  The scanner owns the manifest format; these
 * definitions deliberately mirror only the fields the player can use.
 */
export interface Track {
  filename: string;
  title: string;
  audioPath: string;
  isFavorite: boolean;
  /** Stable opaque identifier used by the public, single-track share route. */
  shareId: string;
}

export interface LibraryFolder {
  id: string;
  name: string;
  tracks: Track[];
}

export interface Library {
  folders: LibraryFolder[];
}

/** Values supplied by the small runtime config script in the deployed site. */
export interface RuntimeConfig {
  /** Location of the generated `library.json` manifest. */
  libraryUrl: string;
  /** Base URL used to resolve a track's `audioPath`. */
  mediaBaseUrl: string;
  /** Client-side password used to gate the root library UI. */
  libraryPassword: string;
}

export type LibraryStatus = "idle" | "loading" | "ready" | "empty" | "error";

export type PlaybackStatus =
  | "idle"
  | "loading"
  | "buffering"
  | "playing"
  | "paused"
  | "ended"
  | "error";
