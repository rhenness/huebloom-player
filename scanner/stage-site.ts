import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { type Library, LibraryValidationError, parseLibrary, serializeLibrary } from "./library";
import { parseWaveformData, WaveformError } from "./waveforms";

const runtimeConfigFilename = "config.js";
const excludedMediaExtensions = new Set([".mp3", ".wav"]);
const shareTitlePrefix = "Huebloom shared a track";

export interface StageSiteOptions {
  repositoryRoot?: string;
  outputDirectory?: string;
  uiBuildDirectory?: string;
  mediaBaseUrl?: string;
  libraryPassword?: string;
}

export interface StageSiteResult {
  outputDirectory: string;
  mediaBaseUrl: string;
}

export class StageSiteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StageSiteError";
  }
}

function defaultRepositoryRoot(): string {
  return path.resolve(__dirname, "..");
}

function loadLocalEnvironment(repositoryRoot: string): void {
  try {
    process.loadEnvFile(path.join(repositoryRoot, ".env"));
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }

    throw new StageSiteError(`Unable to load .env: ${String(error)}`);
  }
}

function resolveMediaBaseUrl(mediaBaseUrl: string | undefined): string {
  if (!mediaBaseUrl) {
    throw new StageSiteError(
      "HUEBLOOM_MEDIA_BASE_URL is required to build the deployment site.",
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(mediaBaseUrl);
  } catch {
    throw new StageSiteError(
      "HUEBLOOM_MEDIA_BASE_URL must be an absolute http or https URL.",
    );
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new StageSiteError(
      "HUEBLOOM_MEDIA_BASE_URL must be an absolute http or https URL.",
    );
  }

  if (parsedUrl.search || parsedUrl.hash) {
    throw new StageSiteError(
      "HUEBLOOM_MEDIA_BASE_URL cannot include a query string or hash.",
    );
  }

  return parsedUrl.href.endsWith("/") ? parsedUrl.href : `${parsedUrl.href}/`;
}

function resolveLibraryPassword(libraryPassword: string | undefined): string {
  return libraryPassword && libraryPassword.trim().length > 0
    ? libraryPassword
    : "change-me";
}

function serializeRuntimeConfig(mediaBaseUrl: string, libraryPassword: string): string {
  return `window.HUEBLOOM_CONFIG = Object.freeze({
  libraryUrl: "./library.json",
  mediaBaseUrl: ${JSON.stringify(mediaBaseUrl)},
  libraryPassword: ${JSON.stringify(libraryPassword)},
});
`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

function createSharePageHtml(compiledIndexHtml: string, trackTitle: string): string {
  const openingHeadTag = /<head(?:\s[^>]*)?>/i;
  const titleElement = /<title(?:\s[^>]*)?>[\s\S]*?<\/title>/i;

  if (!openingHeadTag.test(compiledIndexHtml)) {
    throw new StageSiteError(
      "Compiled UI index.html must contain a <head> element to create share pages.",
    );
  }

  if (!titleElement.test(compiledIndexHtml)) {
    throw new StageSiteError(
      "Compiled UI index.html must contain a <title> element to create share pages.",
    );
  }

  const escapedTitle = escapeHtml(`${shareTitlePrefix} | ${trackTitle}`);

  // Every generated page lives at share/{id}/index.html.  The base keeps the
  // relative Vite assets, config, and catalog rooted at the deployed site.
  return compiledIndexHtml
    .replace(titleElement, `<title>${escapedTitle}</title>`)
    .replace(
      openingHeadTag,
      (match) =>
        `${match}\n    <base href=\"../../\" />\n    <meta property=\"og:title\" content=\"${escapedTitle}\" />`,
    );
}

async function readLibraryForStage(libraryPath: string): Promise<Library> {
  let contents: string;

  try {
    contents = await readFile(libraryPath, "utf8");
  } catch (error) {
    throw new StageSiteError(`Unable to read library.json: ${String(error)}`);
  }

  try {
    return parseLibrary(contents);
  } catch (error) {
    if (error instanceof LibraryValidationError) {
      throw new StageSiteError(`Cannot stage site: ${error.message}`);
    }

    throw error;
  }
}

async function stageSharePages(
  outputDirectory: string,
  compiledIndexHtml: string,
  library: Library,
): Promise<void> {
  const tracks = library.folders.flatMap((folder) => folder.tracks);

  if (tracks.length === 0) {
    return;
  }

  await Promise.all(
    tracks.map(async (track) => {
      const shareDirectory = path.join(outputDirectory, "share", track.shareId);
      await mkdir(shareDirectory, { recursive: true });
      await writeFile(
        path.join(shareDirectory, "index.html"),
        createSharePageHtml(compiledIndexHtml, track.title),
        "utf8",
      );
    }),
  );
}

async function stageWaveforms(
  sourceDirectory: string,
  outputDirectory: string,
  library: Library,
): Promise<void> {
  const outputWaveformDirectory = path.join(outputDirectory, "waveforms");
  const tracks = library.folders.flatMap((folder) => folder.tracks);
  await mkdir(outputWaveformDirectory, { recursive: true });

  await Promise.all(
    tracks.map(async (track) => {
      const filename = `${track.shareId}.json`;
      const sourcePath = path.join(sourceDirectory, filename);

      try {
        parseWaveformData(await readFile(sourcePath, "utf8"));
        await copyFile(sourcePath, path.join(outputWaveformDirectory, filename));
      } catch (error) {
        const detail = error instanceof WaveformError ? error.message : String(error);
        throw new StageSiteError(
          `Waveform for ${track.audioPath} is missing or invalid: ${detail}`,
        );
      }
    }),
  );
}

async function copyDirectoryContents(
  sourceDirectory: string,
  destinationDirectory: string,
  excludedDirectoryNames: ReadonlySet<string> = new Set(),
): Promise<void> {
  const entries = await readdir(sourceDirectory, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      if (entry.isDirectory() && excludedDirectoryNames.has(entry.name)) {
        return;
      }

      if (
        entry.isFile() &&
        excludedMediaExtensions.has(path.extname(entry.name).toLowerCase())
      ) {
        return;
      }

      const sourcePath = path.join(sourceDirectory, entry.name);
      const destinationPath = path.join(destinationDirectory, entry.name);

      if (entry.isDirectory()) {
        await mkdir(destinationPath, { recursive: true });
        await copyDirectoryContents(
          sourcePath,
          destinationPath,
          excludedDirectoryNames,
        );
        return;
      }

      if (entry.isFile()) {
        await copyFile(sourcePath, destinationPath);
        return;
      }

      throw new StageSiteError(
        `Cannot stage unsupported UI entry: ${sourcePath}`,
      );
    }),
  );
}

async function assertFile(
  filePath: string,
  description: string,
): Promise<void> {
  try {
    const fileStats = await stat(filePath);

    if (!fileStats.isFile()) {
      throw new StageSiteError(`${description} must be a file: ${filePath}`);
    }
  } catch (error) {
    if (error instanceof StageSiteError) {
      throw error;
    }

    throw new StageSiteError(`${description} is missing: ${filePath}`);
  }
}

async function assertDirectory(
  directoryPath: string,
  description: string,
): Promise<void> {
  try {
    const directoryStats = await stat(directoryPath);

    if (!directoryStats.isDirectory()) {
      throw new StageSiteError(
        `${description} must be a directory: ${directoryPath}`,
      );
    }
  } catch (error) {
    if (error instanceof StageSiteError) {
      throw error;
    }

    throw new StageSiteError(`${description} is missing: ${directoryPath}`);
  }
}

export async function stageSite(
  options: StageSiteOptions = {},
): Promise<StageSiteResult> {
  const repositoryRoot = path.resolve(
    options.repositoryRoot ?? defaultRepositoryRoot(),
  );
  const outputDirectory = path.resolve(
    options.outputDirectory ?? path.join(repositoryRoot, "dist"),
  );
  loadLocalEnvironment(repositoryRoot);
  const mediaBaseUrl = resolveMediaBaseUrl(
    options.mediaBaseUrl ?? process.env.HUEBLOOM_MEDIA_BASE_URL,
  );
  const libraryPassword = resolveLibraryPassword(
    options.libraryPassword ?? process.env.HUEBLOOM_LIBRARY_PASSWORD,
  );
  const uiBuildDirectory = path.resolve(
    options.uiBuildDirectory ?? path.join(repositoryRoot, ".ui-build"),
  );
  const libraryPath = path.join(repositoryRoot, "library.json");
  const waveformDataDirectory = path.join(repositoryRoot, ".waveforms", "data");
  const compiledIndexPath = path.join(uiBuildDirectory, "index.html");
  const temporaryDirectory = `${outputDirectory}.tmp-${process.pid}-${randomUUID()}`;

  await Promise.all([
    assertDirectory(uiBuildDirectory, "Compiled UI build directory"),
    assertFile(compiledIndexPath, "Compiled UI index.html"),
    assertFile(libraryPath, "library.json"),
    assertDirectory(waveformDataDirectory, "Generated waveform data directory"),
  ]);

  const [library, compiledIndexHtml] = await Promise.all([
    readLibraryForStage(libraryPath),
    readFile(compiledIndexPath, "utf8"),
  ]);

  await rm(temporaryDirectory, { recursive: true, force: true });
  await mkdir(temporaryDirectory, { recursive: true });

  try {
    await copyDirectoryContents(
      uiBuildDirectory,
      temporaryDirectory,
      // Pages must not receive the Git LFS music tree, even if it is copied
      // into the Vite output by mistake.
      new Set(["music"]),
    );
    await writeFile(
      path.join(temporaryDirectory, "library.json"),
      serializeLibrary(library),
      "utf8",
    );
    await writeFile(
      path.join(temporaryDirectory, runtimeConfigFilename),
      serializeRuntimeConfig(mediaBaseUrl, libraryPassword),
      "utf8",
    );
    await stageWaveforms(waveformDataDirectory, temporaryDirectory, library);
    await stageSharePages(temporaryDirectory, compiledIndexHtml, library);
    await rm(outputDirectory, { recursive: true, force: true });
    await rename(temporaryDirectory, outputDirectory);
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });

    if (error instanceof StageSiteError) {
      throw error;
    }

    throw new StageSiteError(
      `Unable to stage deployment site: ${String(error)}`,
    );
  }

  return { outputDirectory, mediaBaseUrl };
}

async function main(): Promise<void> {
  if (process.argv.length > 2) {
    throw new StageSiteError("Usage: npm run build:site");
  }

  const result = await stageSite();
  console.log(`Staged site in ${result.outputDirectory}.`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`site build failed: ${message}`);
    process.exitCode = 1;
  });
}
