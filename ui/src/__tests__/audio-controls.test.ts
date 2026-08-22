import {
  fromMediaVolume,
  MAX_MEDIA_VOLUME,
  toMediaVolume,
} from "../components/audio-controls";

describe("capped media volume", () => {
  it.each([
    [0, 0],
    [0.5, 0.25],
    [0.75, 0.375],
    [1, 0.5],
    [2, 0.5],
  ])("maps logical volume %s to media volume %s", (logical, media) => {
    expect(toMediaVolume(logical)).toBe(media);
  });

  it.each([
    [0, 0],
    [0.25, 0.5],
    [0.375, 0.75],
    [0.5, 1],
    [1, 1],
  ])("maps media volume %s to logical volume %s", (media, logical) => {
    expect(fromMediaVolume(media)).toBe(logical);
  });

  it("defines a 50% physical output ceiling", () => {
    expect(MAX_MEDIA_VOLUME).toBe(0.5);
  });
});