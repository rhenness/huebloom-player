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
              "isFavorite": true,
              "shareId": "dc3268f1-1c91-4f2a-8e2d-cd79913e5ba9"
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
              shareId: expect.stringMatching(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
              ),
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
              shareId: expect.stringMatching(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
              ),
            },
            {
              filename: "Project_10.mp3",
              title: "A custom title",
              audioPath: "music/2025/Project_10.mp3",
              isFavorite: true,
              shareId: "dc3268f1-1c91-4f2a-8e2d-cd79913e5ba9",
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

  it("rejects duplicate share IDs across the library", () => {
    expect(() =>
      parseLibrary(`{
        "folders": [
          {
            "id": "2025",
            "name": "2025",
            "tracks": [
              {
                "filename": "First.mp3",
                "title": "First",
                "audioPath": "music/2025/First.mp3",
                "isFavorite": false,
                "shareId": "dc3268f1-1c91-4f2a-8e2d-cd79913e5ba9"
              }
            ]
          },
          {
            "id": "2026",
            "name": "2026",
            "tracks": [
              {
                "filename": "Second.mp3",
                "title": "Second",
                "audioPath": "music/2026/Second.mp3",
                "isFavorite": false,
                "shareId": "dc3268f1-1c91-4f2a-8e2d-cd79913e5ba9"
              }
            ]
          }
        ]
      }`),
    ).toThrow(LibraryValidationError);
  });
});
