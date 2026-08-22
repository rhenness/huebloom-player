import { resolveWaveformUrl } from "../config";
import type { RuntimeConfig } from "../types";

describe("resolveWaveformUrl", () => {
  it("resolves waveform data beside the catalog instead of the audio origin", () => {
    const config: RuntimeConfig = {
      libraryUrl: "https://player.example.test/huebloom/library.json",
      mediaBaseUrl: "https://media.example.test/audio/",
      libraryPassword: "test",
    };

    expect(
      resolveWaveformUrl(
        { shareId: "dc3268f1-1c91-4f2a-8e2d-cd79913e5ba9" },
        config,
      ),
    ).toBe(
      "https://player.example.test/huebloom/waveforms/dc3268f1-1c91-4f2a-8e2d-cd79913e5ba9.json",
    );
  });
});