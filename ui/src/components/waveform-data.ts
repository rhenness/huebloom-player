export interface ParsedWaveformData {
  duration: number;
  peaks: Float32Array;
}

export class WaveformDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WaveformDataError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseWaveformData(value: unknown): ParsedWaveformData {
  if (!isRecord(value)) {
    throw new WaveformDataError("Waveform data must be an object.");
  }

  const expectedKeys = ["duration", "peaks", "scale", "version"];
  const actualKeys = Object.keys(value).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new WaveformDataError("Waveform data contains unexpected fields.");
  }

  if (value.version !== 1) {
    throw new WaveformDataError("Unsupported waveform data version.");
  }

  if (
    typeof value.duration !== "number" ||
    !Number.isFinite(value.duration) ||
    value.duration <= 0
  ) {
    throw new WaveformDataError("Waveform duration must be positive.");
  }

  if (value.scale !== 128) {
    throw new WaveformDataError("Unsupported waveform amplitude scale.");
  }

  if (
    !Array.isArray(value.peaks) ||
    value.peaks.length === 0 ||
    value.peaks.length % 2 !== 0
  ) {
    throw new WaveformDataError("Waveform peaks must contain min/max pairs.");
  }

  const peaks = Float32Array.from(value.peaks, (sample) => {
    if (
      !Number.isInteger(sample) ||
      Number(sample) < -128 ||
      Number(sample) > 127
    ) {
      throw new WaveformDataError(
        "Waveform peaks must contain signed 8-bit integers.",
      );
    }

    return Number(sample) / 128;
  });

  return { duration: value.duration, peaks };
}

export function aggregateWaveformPeaks(
  peaks: Float32Array,
  columnCount: number,
): Float32Array {
  const pairCount = Math.floor(peaks.length / 2);
  const safeColumnCount = Math.max(0, Math.floor(columnCount));
  const columns = new Float32Array(safeColumnCount * 2);

  if (pairCount === 0 || safeColumnCount === 0) {
    return columns;
  }

  for (let column = 0; column < safeColumnCount; column += 1) {
    const start = Math.floor((column * pairCount) / safeColumnCount);
    const end = Math.max(
      start + 1,
      Math.floor(((column + 1) * pairCount) / safeColumnCount),
    );
    let minimum = 1;
    let maximum = -1;

    for (let pair = start; pair < Math.min(end, pairCount); pair += 1) {
      minimum = Math.min(minimum, peaks[pair * 2]);
      maximum = Math.max(maximum, peaks[pair * 2 + 1]);
    }

    columns[column * 2] = minimum;
    columns[column * 2 + 1] = maximum;
  }

  return columns;
}