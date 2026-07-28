import { getRuntimeConfig, resolveLibraryUrl } from "./config";
import type { Library, LibraryFolder, RuntimeConfig, Track } from "./types";

export interface FavoriteTrack extends Track {
  folderId: string;
  folderName: string;
}

export interface SharedTrack extends Track {
  folderId: string;
  folderName: string;
}

export class LibraryLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LibraryLoadError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isTrack(value: unknown): value is Track {
  return (
    isRecord(value) &&
    typeof value.filename === "string" &&
    typeof value.title === "string" &&
    typeof value.audioPath === "string" &&
    typeof value.isFavorite === "boolean" &&
    typeof value.shareId === "string"
  );
}

export function isLibraryFolder(value: unknown): value is LibraryFolder {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    Array.isArray(value.tracks) &&
    value.tracks.every(isTrack)
  );
}

/** Validate the public manifest rather than trusting arbitrary JSON. */
export function isLibrary(value: unknown): value is Library {
  return (
    isRecord(value) &&
    Array.isArray(value.folders) &&
    value.folders.every(isLibraryFolder)
  );
}

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Fetch and validate the catalog. Consumers can provide a fetch implementation
 * in tests; browser callers normally use the global fetch.
 */
export async function loadLibrary(
  config: RuntimeConfig = getRuntimeConfig(),
  fetcher: FetchLike = fetch,
): Promise<Library> {
  let response: Response;

  try {
    response = await fetcher(resolveLibraryUrl(config));
  } catch (cause) {
    throw new LibraryLoadError("The music library could not be reached.", {
      cause,
    });
  }

  if (!response.ok) {
    throw new LibraryLoadError(
      `The music library could not be loaded (${response.status}).`,
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (cause) {
    throw new LibraryLoadError("The music library contains invalid JSON.", {
      cause,
    });
  }

  if (!isLibrary(data)) {
    throw new LibraryLoadError(
      "The music library does not match the expected format.",
    );
  }

  return data;
}

export function getFolder(
  library: Library | null,
  folderId: string | null,
): LibraryFolder | null {
  if (!library || !folderId) {
    return null;
  }

  return library.folders.find((folder) => folder.id === folderId) ?? null;
}

/** Flatten favorites while retaining their source folder for the library view. */
export function getFavoriteTracks(library: Library | null): FavoriteTrack[] {
  if (!library) {
    return [];
  }

  return library.folders.flatMap((folder) =>
    folder.tracks
      .filter((track) => track.isFavorite)
      .map((track) => ({
        ...track,
        folderId: folder.id,
        folderName: folder.name,
      })),
  );
}

/** Find a shareable track and retain the year/folder that contains it. */
export function getTrackByShareId(
  library: Library | null,
  shareId: string,
): SharedTrack | null {
  if (!library || !shareId) {
    return null;
  }

  for (const folder of library.folders) {
    const track = folder.tracks.find((candidate) => candidate.shareId === shareId);

    if (track) {
      return {
        ...track,
        folderId: folder.id,
        folderName: folder.name,
      };
    }
  }

  return null;
}
