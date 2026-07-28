# Huebloom

Huebloom is a static browser music library. It reads a generated
[`library.json`](library.json) catalog, presents the music folders and tracks in
a React player, and streams selected MP3 and WAV files from a configurable
media location.

## Quick Start

Use a current Node.js LTS release.

```sh
npm install
npm run build:library
npm run dev:ui
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/) in a browser. The Vite
development server serves the root `library.json` and `music/` tree only for
local development; the browser uses the fallback configuration in
`ui/public/config.js`.

For a local password, copy [`.env.example`](.env.example) to `.env` and set
`HUEBLOOM_LIBRARY_PASSWORD`. The root `.env` is ignored by Git and is read by
both the Vite server and local production staging.

The UI is read-only; the repository and `library.json` remain the source of
truth for catalog metadata. Use the development server rather than opening an
HTML file with `file://`, because the player fetches the catalog and audio.

The root library has a deliberately lightweight client-side password gate. The
development password is `change-me`; update it for a deployment as described
below. Shared `/share/{shareId}/` pages intentionally bypass the gate.

## Commands

| Command                 | Purpose                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| `npm run build`         | Scan the catalog, compile the React UI, then stage `dist/`; requires media URL. |
| `npm run build:library` | Scan `music/` and update `library.json`.                                        |
| `npm run build:ui`      | Compile `ui/` with Vite into the ignored `.ui-build/` intermediate directory.   |
| `npm run build:site`    | Stage compiled UI and `library.json` in `dist/`; requires media URL.            |
| `npm run scan:check`    | Verify that `library.json` matches the music tree without writing changes.      |
| `npm run dev:ui`        | Run the local Vite UI server at `http://127.0.0.1:5173/`.                       |
| `npm run start`         | Alias for `npm run dev:ui`.                                                     |
| `npm run preview`       | Serve an already staged `dist/` artifact at `http://127.0.0.1:8080/`.           |
| `npm test`              | Run Jest tests for scanner/staging and player queue behavior.                   |
| `npm run typecheck`     | Type-check scanner, React UI, and Vite configuration.                           |

## Music Layout

Place MP3 or WAV files one directory below `music/`:

```text
music/
  2024/
    Project_1.mp3
  2025/
    Project_60.wav
```

Each direct child directory of `music/` becomes one library folder. The scanner
includes only direct `.mp3` and `.wav` files inside those folders,
case-insensitively. It ignores root-level audio files, nested files and
directories, unsupported file types, and folders with no eligible tracks.

## Catalog Rules

The scanner writes this shape to `library.json`:

```json
{
    "folders": [
        {
            "id": "2024",
            "name": "2024",
            "tracks": [
                {
                    "filename": "Project_1.mp3",
                    "title": "Project_1",
                    "audioPath": "music/2024/Project_1.mp3",
                    "isFavorite": false,
                    "shareId": "dc3268f1-1c91-4f2a-8e2d-cd79913e5ba9"
                }
            ]
        }
    ]
}
```

`audioPath` is the track identity. On a rescan, a track with the same path
keeps its existing `title`, `isFavorite`, and `shareId` values. New tracks
receive a title from the filename, `isFavorite: false`, and a generated UUID
share ID. Deleted, moved, or renamed paths are removed; a moved or renamed file
is treated as a new track and receives a new share ID. Folders and tracks are
written in natural ascending order.

Use the share icon at the end of an individual track row to copy a link such
as `/share/{shareId}/`. That route opens a
standalone page with only the shared track, its year, and a custom playback
control; it
does not load the library sidebar, queue, or full player UI.

An absent or whitespace-only manifest initializes as an empty library. A
nonempty malformed or schema-invalid manifest stops the scan without replacing
it.

## Production build and GitHub Pages

The production artifact keeps the UI, catalog, and runtime configuration
together, while music stays outside the GitHub Pages upload. Supply an absolute
HTTP(S) base URL that points at the repository's `music/` tree.

You can put the media URL and password in a root `.env` file and run
`npm run build`:

```dotenv
HUEBLOOM_MEDIA_BASE_URL=https://media.githubusercontent.com/media/OWNER/REPOSITORY/main/
HUEBLOOM_LIBRARY_PASSWORD=choose-a-password
```

On PowerShell, set the value for the command with:

```powershell
$env:HUEBLOOM_MEDIA_BASE_URL = "https://media.githubusercontent.com/media/OWNER/REPOSITORY/main/"
$env:HUEBLOOM_LIBRARY_PASSWORD = "choose-a-password"
npm run build
```

`npm run build` runs these stages in order:

1. Generates `library.json` from the checked-out music tree.
2. Runs Vite with `base: "./"`, producing relative asset URLs suitable for a
   GitHub Pages project site in `.ui-build/`.
3. Stages `.ui-build/` into `dist/`, copies `library.json`, replaces
   `config.js` with the supplied media base URL, and generates a static
   `share/{shareId}/index.html` page for every track. This allows direct share
   URLs to work on GitHub Pages without a server-side route rewrite.

The included Pages workflow reads `HUEBLOOM_LIBRARY_PASSWORD` from the
`HUEBLOOM_LIBRARY_PASSWORD` GitHub Actions secret. Add that secret before
deploying; if it is absent, the visible development fallback is `change-me`.

> The root password gate is only a convenience layer: GitHub Pages is static,
> so the password, catalog, and media URLs remain accessible to someone who
> inspects the client-side files. Use an authenticated host or edge access
> control if the music library needs real access protection.

The staging step deliberately excludes any `music/` directory. Do not put
audio files in Vite's public assets: Pages receives only the compiled UI,
runtime config, and catalog. The included GitHub Actions workflow checks out
Git LFS, verifies the catalog, builds this artifact, and deploys `dist/` to
GitHub Pages.
