import type { Library } from "../../types";
import { selectCurrentTrack, usePlayerStore } from "../store";

const library: Library = {
  folders: [
    {
      id: "2026",
      name: "2026",
      tracks: [
        {
          title: "First",
          filename: "First.mp3",
          audioPath: "music/2026/First.mp3",
          isFavorite: false,
          shareId: "f269405a-71aa-4bcd-8a83-c474b9a8efbb",
        },
        {
          title: "Second",
          filename: "Second.mp3",
          audioPath: "music/2026/Second.mp3",
          isFavorite: false,
          shareId: "df76c96c-6067-4b82-b3c9-d1ee0fa7c267",
        },
      ],
    },
  ],
};

describe("player store end-of-track behavior", () => {
  beforeEach(() => {
    usePlayerStore.getState().setLibrary(library);
  });

  it("keeps playback intent and advances to the next track when audio ends", () => {
    const store = usePlayerStore.getState();
    store.selectTrack("2026", library.folders[0].tracks[0]);
    store.onAudioPlay();

    const advanced = usePlayerStore.getState().onAudioEnded();
    const state = usePlayerStore.getState();

    expect(advanced).toBe(true);
    expect(selectCurrentTrack(state)?.title).toBe("Second");
    expect(state.playbackIntent).toBe(true);
    expect(state.playbackStatus).toBe("loading");
  });

  it("stops cleanly when the final track ends", () => {
    const store = usePlayerStore.getState();
    store.selectTrack("2026", library.folders[0].tracks[1]);
    store.onAudioPlay();

    const advanced = usePlayerStore.getState().onAudioEnded();
    const state = usePlayerStore.getState();

    expect(advanced).toBe(false);
    expect(selectCurrentTrack(state)?.title).toBe("Second");
    expect(state.playbackIntent).toBe(false);
    expect(state.playbackStatus).toBe("ended");
  });
});
