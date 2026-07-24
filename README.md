# Huebloom

Huebloom is a static browser music library. It reads a generated
[`library.json`](library.json) catalog, presents the music folders and tracks in
the browser, and plays selected MP3 and WAV files with the native audio
controls.

## Quick Start

Use a current Node.js LTS release.

```sh
npm install
npm run build:library
npm run start
```

Open [http://127.0.0.1:8080/ui/](http://127.0.0.1:8080/ui/) in a browser.
Select a track to start playback. The UI is read-only; the repository and
`library.json` remain the source of truth for catalog metadata.

Use a local HTTP server rather than opening `ui/index.html` with `file://`,
because the player fetches the manifest and audio files.

## Commands

| Command                 | Purpose                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| `npm run build`         | Build the catalog, then stage `dist/`; requires `HUEBLOOM_MEDIA_BASE_URL`. |
| `npm run build:library` | Scan `music/` and update `library.json`.                                   |
| `npm run build:site`    | Stage the static site in `dist/`; requires `HUEBLOOM_MEDIA_BASE_URL`.      |
| `npm run scan:check`    | Verify that `library.json` matches the music tree without writing changes. |
| `npm run start`         | Serve the repository locally at `http://127.0.0.1:8080`.                   |
| `npm test`              | Run Jest tests for scanner traversal and reconciliation.                   |
| `npm run typecheck`     | Type-check the TypeScript scanner.                                         |

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
                    "isFavorite": false
                }
            ]
        }
    ]
}
```

`audioPath` is the track identity. On a rescan, a track with the same path
keeps its existing `title` and `isFavorite` values. New tracks receive a title
from the filename and `isFavorite: false`. Deleted, moved, or renamed paths are
removed; a moved or renamed file is treated as a new track. Folders and tracks
are written in natural ascending order.

An absent or whitespace-only manifest initializes as an empty library. A
nonempty malformed or schema-invalid manifest stops the scan without replacing
it.
