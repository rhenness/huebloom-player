import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin } from "vite";

const repositoryRoot = path.resolve(__dirname);
const uiRoot = path.join(repositoryRoot, "ui");
const uiBuildDirectory = path.join(repositoryRoot, ".ui-build");
const musicRoot = path.join(repositoryRoot, "music");

function isWithinDirectory(candidatePath: string, directoryPath: string): boolean {
  const relativePath = path.relative(directoryPath, candidatePath);

  return (
    relativePath.length > 0 &&
    !relativePath.startsWith(`..${path.sep}`) &&
    relativePath !== ".." &&
    !path.isAbsolute(relativePath)
  );
}

function contentTypeFor(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".json":
      return "application/json; charset=utf-8";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
}

function sendLocalFile(
  request: IncomingMessage,
  response: ServerResponse,
  filePath: string,
  fileSize: number,
): void {
  const rangeHeader = request.headers.range;
  let start = 0;
  let end = fileSize - 1;

  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);

    if (!match) {
      response.statusCode = 416;
      response.setHeader("Content-Range", `bytes */${fileSize}`);
      response.end();
      return;
    }

    const [, startValue, endValue] = match;

    if (startValue.length === 0) {
      const suffixLength = Number(endValue);

      if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
        response.statusCode = 416;
        response.setHeader("Content-Range", `bytes */${fileSize}`);
        response.end();
        return;
      }

      start = Math.max(fileSize - suffixLength, 0);
    } else {
      start = Number(startValue);
    }

    if (endValue.length > 0) {
      end = Number(endValue);
    }

    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start >= fileSize ||
      end < start
    ) {
      response.statusCode = 416;
      response.setHeader("Content-Range", `bytes */${fileSize}`);
      response.end();
      return;
    }

    end = Math.min(end, fileSize - 1);
    response.statusCode = 206;
    response.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
  }

  response.setHeader("Accept-Ranges", "bytes");
  response.setHeader("Content-Length", end - start + 1);
  response.setHeader("Content-Type", contentTypeFor(filePath));
  response.setHeader("Cache-Control", "no-cache");

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  const stream = createReadStream(filePath, { start, end });
  stream.on("error", () => {
    if (!response.headersSent) {
      response.statusCode = 500;
    }

    response.end();
  });
  stream.pipe(response);
}

function localLibraryPlugin(): Plugin {
  return {
    name: "huebloom-local-library",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (
          !request.url ||
          (request.method !== "GET" && request.method !== "HEAD")
        ) {
          next();
          return;
        }

        const requestPath = new URL(request.url, "http://localhost").pathname;
        let filePath: string | undefined;

        if (requestPath === "/library.json") {
          filePath = path.join(repositoryRoot, "library.json");
        } else if (requestPath.startsWith("/music/")) {
          let relativeMusicPath: string;

          try {
            relativeMusicPath = decodeURIComponent(
              requestPath.slice("/music/".length),
            );
          } catch {
            response.statusCode = 400;
            response.end("Invalid media URL.");
            return;
          }

          const candidatePath = path.resolve(musicRoot, relativeMusicPath);

          if (!isWithinDirectory(candidatePath, musicRoot)) {
            response.statusCode = 403;
            response.end("Invalid media path.");
            return;
          }

          filePath = candidatePath;
        } else {
          next();
          return;
        }

        try {
          const fileStats = await stat(filePath);

          if (!fileStats.isFile()) {
            next();
            return;
          }

          sendLocalFile(request, response, filePath, fileStats.size);
        } catch {
          next();
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, repositoryRoot, "");
  const libraryPassword = environment.HUEBLOOM_LIBRARY_PASSWORD ?? "change-me";

  return {
    root: uiRoot,
    base: "./",
    publicDir: path.join(uiRoot, "public"),
    define: {
      __HUEBLOOM_LIBRARY_PASSWORD__: JSON.stringify(libraryPassword),
    },
    esbuild: {
      jsx: "automatic",
    },
    plugins: [localLibraryPlugin()],
    build: {
      outDir: uiBuildDirectory,
      emptyOutDir: true,
    },
    server: {
      fs: {
        allow: [repositoryRoot],
      },
    },
  };
});
