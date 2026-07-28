import { randomUUID } from "node:crypto";

export interface Library {
  folders: Folder[];
}

export interface Folder {
  id: string;
  name: string;
  tracks: Track[];
}

export interface Track {
  filename: string;
  title: string;
  audioPath: string;
  isFavorite: boolean;
  /** Stable opaque identifier used by the public, single-track share route. */
  shareId: string;
}

export interface DiscoveredFolder {
  id: string;
  name: string;
  tracks: DiscoveredTrack[];
}

export interface DiscoveredTrack {
  filename: string;
  title: string;
  audioPath: string;
}

export class LibraryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryValidationError";
  }
}

const naturalCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  location: string,
): void {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();

  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    throw new LibraryValidationError(
      `${location} must contain exactly: ${sortedExpectedKeys.join(", ")}.`,
    );
  }
}

function assertString(
  value: unknown,
  location: string,
): asserts value is string {
  if (typeof value !== "string") {
    throw new LibraryValidationError(`${location} must be a string.`);
  }
}

function assertBoolean(
  value: unknown,
  location: string,
): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new LibraryValidationError(`${location} must be a boolean.`);
  }
}

function assertShareId(
  value: unknown,
  location: string,
): asserts value is string {
  assertString(value, location);

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    throw new LibraryValidationError(`${location} must be a UUID v4.`);
  }
}

function assertUnique(values: readonly string[], location: string): void {
  const duplicates = values.filter(
    (value, index) => values.indexOf(value) !== index,
  );

  if (duplicates.length > 0) {
    throw new LibraryValidationError(
      `${location} contains duplicate value: ${duplicates[0]}.`,
    );
  }
}

function validateTrack(value: unknown, location: string): Track {
  if (!isRecord(value)) {
    throw new LibraryValidationError(`${location} must be an object.`);
  }

  const hasShareId = Object.hasOwn(value, "shareId");
  // Read legacy catalogs without an ID so the next scan can migrate them.
  // Any other unknown or missing field remains an error.
  assertExactKeys(
    value,
    hasShareId
      ? ["audioPath", "filename", "isFavorite", "shareId", "title"]
      : ["audioPath", "filename", "isFavorite", "title"],
    location,
  );
  assertString(value.filename, `${location}.filename`);
  assertString(value.title, `${location}.title`);
  assertString(value.audioPath, `${location}.audioPath`);
  assertBoolean(value.isFavorite, `${location}.isFavorite`);

  let shareId: string;

  if (hasShareId) {
    const candidateShareId = value.shareId;
    assertShareId(candidateShareId, `${location}.shareId`);
    shareId = candidateShareId;
  } else {
    shareId = randomUUID();
  }

  return {
    filename: value.filename,
    title: value.title,
    audioPath: value.audioPath,
    isFavorite: value.isFavorite,
    shareId,
  };
}

function validateFolder(value: unknown, location: string): Folder {
  if (!isRecord(value)) {
    throw new LibraryValidationError(`${location} must be an object.`);
  }

  assertExactKeys(value, ["id", "name", "tracks"], location);
  assertString(value.id, `${location}.id`);
  assertString(value.name, `${location}.name`);

  if (!Array.isArray(value.tracks)) {
    throw new LibraryValidationError(`${location}.tracks must be an array.`);
  }

  const tracks = value.tracks.map((track, index) =>
    validateTrack(track, `${location}.tracks[${index}]`),
  );
  assertUnique(
    tracks.map((track) => track.audioPath),
    `${location}.tracks audioPath values`,
  );

  return { id: value.id, name: value.name, tracks };
}

export function validateLibrary(value: unknown): Library {
  if (!isRecord(value)) {
    throw new LibraryValidationError("library.json must contain an object.");
  }

  assertExactKeys(value, ["folders"], "library.json");

  if (!Array.isArray(value.folders)) {
    throw new LibraryValidationError("library.json.folders must be an array.");
  }

  const folders = value.folders.map((folder, index) =>
    validateFolder(folder, `library.json.folders[${index}]`),
  );
  assertUnique(
    folders.map((folder) => folder.id),
    "library.json folder ids",
  );
  assertUnique(
    folders.flatMap((folder) => folder.tracks.map((track) => track.shareId)),
    "library.json track shareId values",
  );

  return { folders };
}

export function parseLibrary(contents: string): Library {
  if (contents.trim().length === 0) {
    return { folders: [] };
  }

  try {
    return validateLibrary(JSON.parse(contents));
  } catch (error) {
    if (error instanceof LibraryValidationError) {
      throw error;
    }

    throw new LibraryValidationError("library.json contains invalid JSON.");
  }
}

export function naturalCompare(left: string, right: string): number {
  const comparison = naturalCollator.compare(left, right);

  if (comparison !== 0) {
    return comparison;
  }

  return left.localeCompare(right);
}

export function reconcileLibrary(
  existingLibrary: Library,
  discoveredFolders: readonly DiscoveredFolder[],
): Library {
  const existingTracksByAudioPath = new Map<string, Track>();

  for (const folder of existingLibrary.folders) {
    for (const track of folder.tracks) {
      existingTracksByAudioPath.set(track.audioPath, track);
    }
  }

  const folders = [...discoveredFolders]
    .sort((left, right) => {
      const nameComparison = naturalCompare(left.name, right.name);
      return nameComparison === 0
        ? naturalCompare(left.id, right.id)
        : nameComparison;
    })
    .map((folder) => ({
      id: folder.id,
      name: folder.name,
      tracks: [...folder.tracks]
        .sort((left, right) => {
          const filenameComparison = naturalCompare(
            left.filename,
            right.filename,
          );
          return filenameComparison === 0
            ? naturalCompare(left.audioPath, right.audioPath)
            : filenameComparison;
        })
        .map((track) => {
          const existingTrack = existingTracksByAudioPath.get(track.audioPath);

          return {
            filename: track.filename,
            title: existingTrack?.title ?? track.title,
            audioPath: track.audioPath,
            isFavorite: existingTrack?.isFavorite ?? false,
            shareId: existingTrack?.shareId ?? randomUUID(),
          };
        }),
    }))
    .filter((folder) => folder.tracks.length > 0);

  return { folders };
}

export function serializeLibrary(library: Library): string {
  return `${JSON.stringify(library, null, 2)}\n`;
}
