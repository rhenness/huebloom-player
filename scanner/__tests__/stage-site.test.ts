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
    await writeFixtureFile(repositoryRoot, "ui/index.html", "<main></main>");
    await writeFixtureFile(repositoryRoot, "ui/styles.css", "body {}");
    await writeFixtureFile(repositoryRoot, "ui/app.js", "window.app = true;");
    await writeFixtureFile(
      repositoryRoot,
      "ui/config.js",
      "window.HUEBLOOM_CONFIG = {};",
    );
    await writeFixtureFile(
      repositoryRoot,
      "library.json",
      '{\n  "folders": []\n}\n',
    );
    await writeFixtureFile(repositoryRoot, "music/2024/Project_1.mp3", "ID3");
  });

  afterEach(async () => {
    await rm(repositoryRoot, { recursive: true, force: true });
  });

  it("creates a clean standalone site artifact with deployment configuration", async () => {
    const outputDirectory = path.join(repositoryRoot, "dist");
    await writeFixtureFile(repositoryRoot, "dist/stale.txt", "stale");

    const result = await stageSite({
      repositoryRoot,
      outputDirectory,
      mediaBaseUrl:
        "https://media.githubusercontent.com/media/octocat/huebloom/main",
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
      readFile(path.join(outputDirectory, "stale.txt"), "utf8"),
    ).rejects.toThrow("ENOENT");
    await expect(
      readFile(
        path.join(outputDirectory, "music", "2024", "Project_1.mp3"),
        "utf8",
      ),
    ).rejects.toThrow("ENOENT");
    await expect(
      readFile(path.join(outputDirectory, "config.js"), "utf8"),
    ).resolves.toBe(
      `window.HUEBLOOM_CONFIG = Object.freeze({
  libraryUrl: "./library.json",
  mediaBaseUrl: "https://media.githubusercontent.com/media/octocat/huebloom/main/",
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
});
