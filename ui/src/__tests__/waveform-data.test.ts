import {
  aggregateWaveformPeaks,
  parseWaveformData,
  WaveformDataError,
} from "../components/waveform-data";

describe("parseWaveformData", () => {
  it("normalizes signed 8-bit min/max pairs for WaveSurfer", () => {
    const result = parseWaveformData({
      version: 1,
      duration: 12.5,
      scale: 128,
      peaks: [-128, 127, -64, 64],
    });

    expect(result.duration).toBe(12.5);
    expect(Array.from(result.peaks)).toEqual([-1, 127 / 128, -0.5, 0.5]);
  });

  it.each([
    ["non-object data", null],
    [
      "an unsupported version",
      { version: 2, duration: 1, scale: 128, peaks: [-1, 1] },
    ],
    [
      "an invalid duration",
      { version: 1, duration: 0, scale: 128, peaks: [-1, 1] },
    ],
    [
      "an unsupported scale",
      { version: 1, duration: 1, scale: 127, peaks: [-1, 1] },
    ],
    [
      "unpaired peaks",
      { version: 1, duration: 1, scale: 128, peaks: [-1] },
    ],
    [
      "out-of-range peaks",
      { version: 1, duration: 1, scale: 128, peaks: [-129, 1] },
    ],
    [
      "unexpected fields",
      {
        version: 1,
        duration: 1,
        scale: 128,
        peaks: [-1, 1],
        extra: true,
      },
    ],
  ])("rejects %s", (_description, value) => {
    expect(() => parseWaveformData(value)).toThrow(WaveformDataError);
  });
});

describe("aggregateWaveformPeaks", () => {
  it("keeps the minimum and maximum represented in each canvas column", () => {
    const columns = aggregateWaveformPeaks(
      Float32Array.from([-0.2, 0.3, -0.8, 0.6, -0.4, 0.9, -0.1, 0.2]),
      2,
    );

    expect(Array.from(columns)).toEqual([
      expect.closeTo(-0.8),
      expect.closeTo(0.6),
      expect.closeTo(-0.4),
      expect.closeTo(0.9),
    ]);
  });

  it("returns an empty preview when no columns are available", () => {
    expect(aggregateWaveformPeaks(Float32Array.from([-1, 1]), 0)).toHaveLength(0);
  });
});