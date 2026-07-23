import {
  LibraryValidationError,
  parseLibrary,
  reconcileLibrary,
  serializeLibrary,
} from "../library";

describe("reconcileLibrary", () => {
  it("sorts entries and preserves editable metadata for unchanged audio paths", () => {
    const existingLibrary = parseLibrary(`{
      "folders": [
        {
          "id": "2025",
          "name": "2025",
          "tracks": [
            {
              "filename": "Project_10.mp3",
              "title": "A custom title",
              "audioPath": "music/2025/Project_10.mp3",
              "isFavorite": true
            }
          ]
        }
      ]
    }`);

    const result = reconcileLibrary(existingLibrary, [
      {
        id: "2025",
        name: "2025",
        tracks: [
          {
            filename: "Project_10.mp3",
            title: "Project_10",
            audioPath: "music/2025/Project_10.mp3",
          },
          {
            filename: "Project_2.mp3",
            title: "Project_2",
            audioPath: "music/2025/Project_2.mp3",
          },
        ],
      },
      {
        id: "2024",
        name: "2024",
        tracks: [
          {
            filename: "Project_1.mp3",
            title: "Project_1",
            audioPath: "music/2024/Project_1.mp3",
          },
        ],
      },
      {
        id: "empty",
        name: "empty",
        tracks: [],
      },
    ]);

    expect(result).toEqual({
      folders: [
        {
          id: "2024",
          name: "2024",
          tracks: [
            {
              filename: "Project_1.mp3",
              title: "Project_1",
              audioPath: "music/2024/Project_1.mp3",
              isFavorite: false,
            },
          ],
        },
        {
          id: "2025",
          name: "2025",
          tracks: [
            {
              filename: "Project_2.mp3",
              title: "Project_2",
              audioPath: "music/2025/Project_2.mp3",
              isFavorite: false,
            },
            {
              filename: "Project_10.mp3",
              title: "A custom title",
              audioPath: "music/2025/Project_10.mp3",
              isFavorite: true,
            },
          ],
        },
      ],
    });

    expect(serializeLibrary(result)).toBe(
      `${JSON.stringify(result, null, 2)}\n`,
    );
  });

  it("rejects nonempty manifests that do not match the exact library schema", () => {
    expect(() => parseLibrary('{"folders": [], "schemaVersion": 1}')).toThrow(
      LibraryValidationError,
    );
  });
});
