import { useCallback, useEffect, useRef } from "react";

import { getRuntimeConfig, resolveTrackUrl } from "../config";
import type { RuntimeConfig } from "../types";
import { selectCurrentTrack, usePlayerStore } from "./store";

export interface UseAudioControllerOptions {
  config?: RuntimeConfig;
}

export interface AudioController {
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

function playbackErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Playback was blocked by the browser. Press play to try again.";
  }

  return "Audio could not be played. Check the media connection and try again.";
}

/**
 * Bridges the serializable Zustand player state to exactly one HTML audio
 * element. The element is deliberately owned here rather than being placed in
 * global state, which keeps media side effects out of rendering logic.
 */
export function useAudioController(
  options: UseAudioControllerOptions = {},
): AudioController {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastHandledPlayRequestId = useRef<number | null>(null);
  const config = options.config ?? getRuntimeConfig();
  const currentTrack = usePlayerStore(selectCurrentTrack);
  const trackRequestId = usePlayerStore((state) => state.trackRequestId);
  const playRequestId = usePlayerStore((state) => state.playRequestId);
  const playbackIntent = usePlayerStore((state) => state.playbackIntent);
  const seekRequestId = usePlayerStore((state) => state.seekRequestId);
  const seekTarget = usePlayerStore((state) => state.seekTarget);
  const volume = usePlayerStore((state) => state.volume);
  const muted = usePlayerStore((state) => state.muted);

  const attemptPlay = useCallback(async (requestId: number) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    try {
      await audio.play();
    } catch (error) {
      const state = usePlayerStore.getState();
      // A source change can reject the old play promise. Only surface an
      // error when the request is still the current track and is meant to play.
      if (state.trackRequestId === requestId && state.playbackIntent) {
        state.setPlaybackError(playbackErrorMessage(error));
      }
    }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return undefined;
    }

    const onLoadedMetadata = () => {
      usePlayerStore.getState().setDuration(audio.duration);
    };
    const onDurationChange = () => {
      usePlayerStore.getState().setDuration(audio.duration);
    };
    const onTimeUpdate = () => {
      usePlayerStore.getState().setCurrentTime(audio.currentTime);
    };
    const onPlay = () => usePlayerStore.getState().onAudioPlay();
    const onPause = () => usePlayerStore.getState().onAudioPause();
    const onWaiting = () => usePlayerStore.getState().onAudioWaiting();
    const onCanPlay = () => usePlayerStore.getState().onAudioCanPlay();
    const onEnded = () => {
      usePlayerStore.getState().onAudioEnded();
    };
    const onVolumeChange = () => {
      usePlayerStore.getState().syncAudioVolume(audio.volume, audio.muted);
    };
    const onError = () => {
      // Source transitions may emit an abort error for the old track. It is
      // expected and should not overwrite the state of the new selection.
      if (!audio.src || audio.error?.code === MediaError.MEDIA_ERR_ABORTED) {
        return;
      }

      usePlayerStore
        .getState()
        .setPlaybackError("Audio could not be loaded. Check the media connection and try again.");
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("volumechange", onVolumeChange);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("volumechange", onVolumeChange);
      audio.removeEventListener("error", onError);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (!currentTrack) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      return;
    }

    audio.pause();
    audio.src = resolveTrackUrl(currentTrack, config);
    audio.load();

    const state = usePlayerStore.getState();
    // Track selection changes both IDs, then the play-request effect below
    // starts it. Auto-next changes only the source ID, so resume here.
    if (
      state.playbackIntent &&
      lastHandledPlayRequestId.current === state.playRequestId
    ) {
      void attemptPlay(trackRequestId);
    }
  }, [attemptPlay, config, currentTrack?.audioPath, trackRequestId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || lastHandledPlayRequestId.current === playRequestId) {
      return;
    }

    lastHandledPlayRequestId.current = playRequestId;
    if (!playbackIntent) {
      audio.pause();
      return;
    }

    if (currentTrack) {
      void attemptPlay(trackRequestId);
    }
  }, [attemptPlay, currentTrack, playRequestId, playbackIntent, trackRequestId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) {
      return;
    }

    if (Math.abs(audio.currentTime - seekTarget) > 0.05) {
      try {
        audio.currentTime = seekTarget;
      } catch {
        // A just-loaded media element can reject a seek before metadata is
        // available; the next explicit seek or metadata update will recover.
      }
    }
  }, [currentTrack?.audioPath, seekRequestId, seekTarget]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.volume = volume;
    audio.muted = muted;
  }, [muted, volume]);

  return { audioRef };
}
