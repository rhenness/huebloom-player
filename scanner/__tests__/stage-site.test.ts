import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { StageSiteError, stageSite } from "../stage-site";

async function createTemporaryDirectory(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    require("node:fs").mkdtemp(
      path.join(tmpdir(), "huebloom-site-"),
      (error: Error | null, directory: string) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(directory);
      },
    );
  });
}

async function writeFixtureFile(
  repositoryRoot: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  const filePath = path.join(repositoryRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

describe("stageSite", () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await createTemporaryDirectory();
    await writeFixtureFile(repositoryRoot, "ui/index.html", "<source></source>");
    await writeFixtureFile(repositoryRoot, "ui/src/main.tsx", "export {};");
    await writeFixtureFile(
      repositoryRoot,
      ".ui-build/index.html",
      "<main></main>",
    );
    await writeFixtureFile(
      repositoryRoot,
      ".ui-build/assets/app-123.js",
      "window.app = true;",
    );
    await writeFixtureFile(
      repositoryRoot,
      ".ui-build/config.js",
      "window.HUEBLOOM_CONFIG = {};",
    );
    await writeFixtureFile(
      repositoryRoot,
      "library.json",
      '{\n  "folders": []\n}\n',
    );
    await mkdir(path.join(repositoryRoot, ".waveforms", "data"), {
      recursive: true,
    });
    await writeFixtureFile(repositoryRoot, "music/2024/Project_1.mp3", "ID3");
    await writeFixtureFile(
      repositoryRoot,
      ".ui-build/music/2024/Project_1.mp3",
      "ID3",
    );
    await writeFixtureFile(
      repositoryRoot,
      ".ui-build/assets/leaked-track.mp3",
      "ID3",
    );
  });

  afterEach(async () => {
    await rm(repositoryRoot, { recursive: true, force: true });
  });

  it("stages the compiled UI with deployment configuration and no music", async () => {
    const outputDirectory = path.join(repositoryRoot, "dist");
    await writeFixtureFile(repositoryRoot, "dist/stale.txt", "stale");

    const result = await stageSite({
      repositoryRoot,
      outputDirectory,
      mediaBaseUrl:
        "https://media.githubusercontent.com/media/octocat/huebloom/main",
      libraryPassword: "test-library-password",
    });

    expect(result).toEqual({
      outputDirectory,
      mediaBaseUrl:
        "https://media.githubusercontent.com/media/octocat/huebloom/main/",
    });
    await expect(
      readFile(path.join(outputDirectory, "index.html"), "utf8"),
    ).resolves.toBe("<main></main>");
    await expect(
      readFile(path.join(outputDirectory, "library.json"), "utf8"),
    ).resolves.toBe('{\n  "folders": []\n}\n');
    await expect(
      readFile(path.join(outputDirectory, "assets", "app-123.js"), "utf8"),
    ).resolves.toBe("window.app = true;");
    await expect(
      readFile(path.join(outputDirectory, "src", "main.tsx"), "utf8"),
    ).rejects.toThrow("ENOENT");
    await expect(
      readFile(path.join(outputDirectory, "stale.txt"), "utf8"),
    ).rejects.toThrow("ENOENT");
    await expect(
      readFile(
        path.join(outputDirectory, "music", "2024", "Project_1.mp3"),
        "utf8",
      ),
    ).rejects.toThrow("ENOENT");
    await expect(
      readFile(path.join(outputDirectory, "assets", "leaked-track.mp3"), "utf8"),
    ).rejects.toThrow("ENOENT");
    await expect(
      readFile(path.join(outputDirectory, "waveforms", "cache.json"), "utf8"),
    ).rejects.toThrow("ENOENT");
    await expect(
      readFile(path.join(outputDirectory, "config.js"), "utf8"),
    ).resolves.toBe(
      `window.HUEBLOOM_CONFIG = Object.freeze({
  libraryUrl: "./library.json",
  mediaBaseUrl: "https://media.githubusercontent.com/media/octocat/huebloom/main/",
  libraryPassword: "test-library-password",
});
`,
    );
  });

  it("requires an absolute public media base URL", async () => {
    await expect(stageSite({ repositoryRoot })).rejects.toThrow(StageSiteError);
    await expect(
      stageSite({ repositoryRoot, mediaBaseUrl: "music/" }),
    ).rejects.toThrow("absolute http or https URL");
  });

  it("creates a direct, Pages-safe share page for every catalog track", async () => {
    const shareId = "dc3268f1-1c91-4f2a-8e2d-cd79913e5ba9";
    await writeFixtureFile(
      repositoryRoot,
      ".ui-build/index.html",
      "<!doctype html><html><head><title>Huebloom</title></head><body><div id=\"root\"></div></body></html>",
    );
    await writeFixtureFile(
      repositoryRoot,
      "library.json",
      `${JSON.stringify(
        {
          folders: [
            {
              id: "2026",
              name: "2026",
              tracks: [
                {
                  filename: "Shared track.mp3",
                  title: "Shared track",
                  audioPath: "music/2026/Shared track.mp3",
                  isFavorite: false,
                  shareId,
                },
              ],
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    const waveform = `${JSON.stringify({
      version: 1,
      duration: 12.5,
      scale: 128,
      peaks: [-64, 63, -32, 31],
    })}\n`;
    await writeFixtureFile(
      repositoryRoot,
      `.waveforms/data/${shareId}.json`,
      waveform,
    );

    const outputDirectory = path.join(repositoryRoot, "dist");
    await stageSite({
      repositoryRoot,
      outputDirectory,
      mediaBaseUrl: "https://media.example.test/huebloom/",
    });

    await expect(
      readFile(
        path.join(outputDirectory, "share", shareId, "index.html"),
        "utf8",
      ),
    ).resolves.toBe(
      "<!doctype html><html><head>\n    <base href=\"../../\" /><title>Huebloom</title></head><body><div id=\"root\"></div></body></html>",
    );
    await expect(
      readFile(
        path.join(outputDirectory, "waveforms", `${shareId}.json`),
        "utf8",
      ),
    ).resolves.toBe(waveform);
  });

  it("refuses to stage a catalog track without valid waveform data", async () => {
    const shareId = "dc3268f1-1c91-4f2a-8e2d-cd79913e5ba9";
    await writeFixtureFile(
      repositoryRoot,
      "library.json",
      `${JSON.stringify({
        folders: [
          {
            id: "2026",
            name: "2026",
            tracks: [
              {
                filename: "Missing.mp3",
                title: "Missing",
                audioPath: "music/2026/Missing.mp3",
                isFavorite: false,
                shareId,
              },
            ],
          },
        ],
      })}\n`,
    );

    await expect(
      stageSite({
        repositoryRoot,
        mediaBaseUrl: "https://media.example.test/huebloom/",
      }),
    ).rejects.toThrow("Waveform for music/2026/Missing.mp3 is missing or invalid");
  });

  it("requires a compiled Vite output directory", async () => {
    await rm(path.join(repositoryRoot, ".ui-build"), {
      recursive: true,
      force: true,
    });

    await expect(
      stageSite({
        repositoryRoot,
        mediaBaseUrl: "https://media.example.test/huebloom/",
      }),
    ).rejects.toThrow("Compiled UI build directory is missing");
  });
});
