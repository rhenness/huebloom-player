import type { Track } from "../../types";
import {
  createQueueState,
  getNextQueueState,
  getPreviousQueueState,
  withShuffleEnabled,
} from "../queue";

const tracks: Track[] = [
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
  {
    title: "Third",
    filename: "Third.mp3",
    audioPath: "music/2026/Third.mp3",
    isFavorite: false,
    shareId: "a8af1cb4-96ae-4940-9ccd-361ed5dc85f9",
  },
];

describe("player queue navigation", () => {
  it("moves through a folder in catalog order", () => {
    const initial = createQueueState(tracks, 0, false);
    const second = getNextQueueState(initial);
    const first = second && getPreviousQueueState(second);

    expect(second?.currentIndex).toBe(1);
    expect(first?.currentIndex).toBe(0);
    expect(getPreviousQueueState(initial)).toBeNull();
  });

  it("uses unplayed shuffle tracks and preserves prior history", () => {
    // A fixed source makes the shuffled remaining order deterministic.
    const initial = createQueueState(tracks, 1, true, () => 0);
    const next = getNextQueueState(initial);
    const previous = next && getPreviousQueueState(next);
    const replayedNext = previous && getNextQueueState(previous);
    const finalTrack = replayedNext && getNextQueueState(replayedNext);

    expect(next?.currentIndex).toBe(2);
    expect(previous?.currentIndex).toBe(1);
    expect(replayedNext?.currentIndex).toBe(2);
    expect(finalTrack?.currentIndex).toBe(0);
    expect(finalTrack && getNextQueueState(finalTrack)).toBeNull();
  });

  it("keeps the active track when shuffle is turned off", () => {
    const shuffled = createQueueState(tracks, 1, true, () => 0);
    const next = getNextQueueState(shuffled);
    const ordered = next && withShuffleEnabled(next, false);

    expect(ordered?.shuffleEnabled).toBe(false);
    expect(ordered?.currentIndex).toBe(2);
    expect(ordered && getNextQueueState(ordered)).toBeNull();
    expect(ordered && getPreviousQueueState(ordered)?.currentIndex).toBe(1);
  });
});
