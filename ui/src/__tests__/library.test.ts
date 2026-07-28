import { getFavoriteTracks, getTrackByShareId } from "../library";
import type { Library } from "../types";

describe("getFavoriteTracks", () => {
  it("flattens favorited tracks while preserving their source folders", () => {
    const library: Library = {
      folders: [
        {
          id: "2025",
          name: "2025",
          tracks: [
            {
              title: "Not saved",
              filename: "Not saved.mp3",
              audioPath: "music/2025/Not saved.mp3",
              isFavorite: false,
              shareId: "069cbf64-cd51-4417-a88b-1b4ecba4e6eb",
            },
            {
              title: "Saved 2025",
              filename: "Saved 2025.mp3",
              audioPath: "music/2025/Saved 2025.mp3",
              isFavorite: true,
              shareId: "c2e6ec1a-4979-4f9f-a82d-4a3b15d03f3d",
            },
          ],
        },
        {
          id: "2026",
          name: "2026",
          tracks: [
            {
              title: "Saved 2026",
              filename: "Saved 2026.mp3",
              audioPath: "music/2026/Saved 2026.mp3",
              isFavorite: true,
              shareId: "067bc0aa-d263-4a2c-a940-0de75f4da8f9",
            },
          ],
        },
      ],
    };

    expect(getFavoriteTracks(library)).toEqual([
      expect.objectContaining({ title: "Saved 2025", folderId: "2025", folderName: "2025" }),
      expect.objectContaining({ title: "Saved 2026", folderId: "2026", folderName: "2026" }),
    ]);

    expect(getTrackByShareId(library, "067bc0aa-d263-4a2c-a940-0de75f4da8f9")).toEqual(
      expect.objectContaining({
        title: "Saved 2026",
        folderId: "2026",
        folderName: "2026",
      }),
    );
    expect(getTrackByShareId(library, "missing-share-id")).toBeNull();
  });
});
