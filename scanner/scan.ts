import { randomUUID } from "node:crypto";
import {
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import {
  type DiscoveredFolder,
  type Library,
  LibraryValidationError,
  parseLibrary,
  reconcileLibrary,
  serializeLibrary,
} from "./library";

const lfsPointerPrefix = "version https://git-lfs.github.com/spec/v1";

export interface ScanOptions {
  repositoryRoot?: string;
  check?: boolean;
}

export interface ScanResult {
  library: Library;
  wasCurrent: boolean;
  written: boolean;
}

export class ScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanError";
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function defaultRepositoryRoot(): string {
  return path.resolve(__dirname, "..");
}

async function readDirectoryEntries(
  directoryPath: string,
): Promise<Dirent<string>[]> {
  return readdir(directoryPath, { encoding: "utf8", withFileTypes: true });
}

async function readExistingLibrary(
  libraryPath: string,
): Promise<{ contents: string | undefined; library: Library }> {
  let contents: string;

  try {
    contents = await readFile(libraryPath, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return { contents: undefined, library: { folders: [] } };
    }

    throw new ScanError(`Unable to read library.json: ${String(error)}`);
  }

  try {
    return { contents, library: parseLibrary(contents) };
  } catch (error) {
    if (error instanceof LibraryValidationError) {
      throw new ScanError(`Cannot scan: ${error.message}`);
    }

    throw error;
  }
}

async function assertNotLfsPointer(filePath: string): Promise<void> {
  const fileHandle = await open(filePath, "r");

  try {
    const header = Buffer.alloc(128);
    const { bytesRead } = await fileHandle.read(header, 0, header.length, 0);
    const contents = header.subarray(0, bytesRead).toString("utf8");

    if (contents.startsWith(lfsPointerPrefix)) {
      throw new ScanError(
        `Cannot scan ${toPosixPath(filePath)} because it is a Git LFS pointer. Run git lfs pull and scan again.`,
      );
    }
  } finally {
    await fileHandle.close();
  }
}

async function discoverFolders(
  repositoryRoot: string,
): Promise<DiscoveredFolder[]> {
  const musicRoot = path.join(repositoryRoot, "music");
  let musicEntries: Dirent<string>[];

  try {
    musicEntries = await readDirectoryEntries(musicRoot);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      throw new ScanError(`Music directory does not exist: ${musicRoot}`);
    }

    throw new ScanError(`Unable to read music directory: ${String(error)}`);
  }

  const folderEntries = musicEntries.filter((entry) => entry.isDirectory());

  return Promise.all(
    folderEntries.map(async (folderEntry) => {
      const folderPath = path.join(musicRoot, folderEntry.name);
      let fileEntries: Dirent<string>[];

      try {
        fileEntries = await readDirectoryEntries(folderPath);
      } catch (error) {
        throw new ScanError(
          `Unable to read music folder ${toPosixPath(folderPath)}: ${String(error)}`,
        );
      }

      const tracks = await Promise.all(
        fileEntries
          .filter(
            (entry) =>
              entry.isFile() &&
              path.extname(entry.name).toLowerCase() === ".mp3",
          )
          .map(async (fileEntry) => {
            const audioFilePath = path.join(folderPath, fileEntry.name);
            await assertNotLfsPointer(audioFilePath);

            return {
              filename: fileEntry.name,
              title: path.basename(
                fileEntry.name,
                path.extname(fileEntry.name),
              ),
              audioPath: toPosixPath(
                path.relative(repositoryRoot, audioFilePath),
              ),
            };
          }),
      );

      return {
        id: toPosixPath(path.relative(musicRoot, folderPath)),
        name: folderEntry.name,
        tracks,
      };
    }),
  );
}

async function writeLibraryAtomically(
  libraryPath: string,
  contents: string,
): Promise<void> {
  const temporaryPath = path.join(
    path.dirname(libraryPath),
    `.${path.basename(libraryPath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    await writeFile(temporaryPath, contents, "utf8");
    await rename(temporaryPath, libraryPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw new ScanError(`Unable to write library.json: ${String(error)}`);
  }
}

export async function scanLibrary(
  options: ScanOptions = {},
): Promise<ScanResult> {
  const repositoryRoot = path.resolve(
    options.repositoryRoot ?? defaultRepositoryRoot(),
  );
  const libraryPath = path.join(repositoryRoot, "library.json");
  const existing = await readExistingLibrary(libraryPath);
  const discoveredFolders = await discoverFolders(repositoryRoot);
  const library = reconcileLibrary(existing.library, discoveredFolders);
  const serializedLibrary = serializeLibrary(library);
  const wasCurrent = existing.contents === serializedLibrary;

  if (options.check) {
    if (!wasCurrent) {
      throw new ScanError(
        "library.json is out of date. Run npm run build:library.",
      );
    }

    return { library, wasCurrent, written: false };
  }

  if (!wasCurrent) {
    await writeLibraryAtomically(libraryPath, serializedLibrary);
  }

  return { library, wasCurrent, written: !wasCurrent };
}

function parseArguments(argumentsList: readonly string[]): ScanOptions {
  if (argumentsList.length === 0) {
    return {};
  }

  if (argumentsList.length === 1 && argumentsList[0] === "--check") {
    return { check: true };
  }

  throw new ScanError("Usage: npm run build:library [-- --check]");
}

async function main(): Promise<void> {
  const result = await scanLibrary(parseArguments(process.argv.slice(2)));

  if (result.written) {
    console.log("Updated library.json.");
    return;
  }

  console.log("library.json is already up to date.");
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`scan failed: ${message}`);
    process.exitCode = 1;
  });
}
