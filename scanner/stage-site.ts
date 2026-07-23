import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const runtimeConfigFilename = "config.js";

export interface StageSiteOptions {
  repositoryRoot?: string;
  outputDirectory?: string;
  mediaBaseUrl?: string;
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

function serializeRuntimeConfig(mediaBaseUrl: string): string {
  return `window.HUEBLOOM_CONFIG = Object.freeze({
  libraryUrl: "./library.json",
  mediaBaseUrl: ${JSON.stringify(mediaBaseUrl)},
});
`;
}

async function copyDirectoryContents(
  sourceDirectory: string,
  destinationDirectory: string,
): Promise<void> {
  const entries = await readdir(sourceDirectory, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const sourcePath = path.join(sourceDirectory, entry.name);
      const destinationPath = path.join(destinationDirectory, entry.name);

      if (entry.isDirectory()) {
        await mkdir(destinationPath, { recursive: true });
        await copyDirectoryContents(sourcePath, destinationPath);
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
  const mediaBaseUrl = resolveMediaBaseUrl(
    options.mediaBaseUrl ?? process.env.HUEBLOOM_MEDIA_BASE_URL,
  );
  const uiDirectory = path.join(repositoryRoot, "ui");
  const libraryPath = path.join(repositoryRoot, "library.json");
  const temporaryDirectory = `${outputDirectory}.tmp-${process.pid}-${randomUUID()}`;

  await Promise.all([
    assertDirectory(uiDirectory, "UI directory"),
    assertFile(libraryPath, "library.json"),
  ]);

  await rm(temporaryDirectory, { recursive: true, force: true });
  await mkdir(temporaryDirectory, { recursive: true });

  try {
    await copyDirectoryContents(uiDirectory, temporaryDirectory);
    await copyFile(libraryPath, path.join(temporaryDirectory, "library.json"));
    await writeFile(
      path.join(temporaryDirectory, runtimeConfigFilename),
      serializeRuntimeConfig(mediaBaseUrl),
      "utf8",
    );
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
