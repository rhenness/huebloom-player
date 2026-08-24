import { create } from 'zustand';

import { getRuntimeConfig } from '../config';
import { getFolder, loadLibrary as fetchLibrary } from '../library';
import type {
    Library,
    LibraryFolder,
    LibraryStatus,
    PlaybackStatus,
    RuntimeConfig,
    Track,
} from '../types';
import {
    EMPTY_QUEUE_STATE,
    PREVIOUS_RESTART_THRESHOLD_SECONDS,
    createQueueState,
    getCurrentTrack,
    getNextQueueState,
    getPreviousQueueState,
    type QueueNavigationState,
    withShuffleEnabled,
} from './queue';

export type PreviousRequestResult = 'restarted' | 'moved' | 'none';
export type LibraryView = 'folder' | 'favorites';

/**
 * Data only: no HTMLAudioElement, promises, timers, or other browser handles
 * are retained here. Media side effects belong in useAudioController.
 */
export interface PlayerDataState extends QueueNavigationState {
    library: Library | null;
    libraryStatus: LibraryStatus;
    libraryError: string | null;
    activeView: LibraryView;
    selectedFolderId: string | null;
    /** Folder that supplied the current queue; browsing does not change it. */
    queueFolderId: string | null;
    isPlaying: boolean;
    /** The user's desired state. It survives source changes for auto-next. */
    playbackIntent: boolean;
    playbackStatus: PlaybackStatus;
    currentTime: number;
    duration: number;
    volume: number;
    muted: boolean;
    /** Recoverable media/autoplay error for the player UI. */
    error: string | null;
    /** Incremented for each source change, including re-selecting the same track. */
    trackRequestId: number;
    /** Incremented to retry a browser play request. */
    playRequestId: number;
    /** A serializable command consumed by the audio controller. */
    seekRequestId: number;
    seekTarget: number;
    /** Guards against an older asynchronous catalog response winning a race. */
    libraryRequestId: number;
}

export interface PlayerActions {
    loadLibrary: (config?: RuntimeConfig) => Promise<void>;
    setLibrary: (library: Library) => void;
    selectFolder: (folderId: string) => void;
    selectFavorites: () => void;
    /** A track can be passed by object or stable audioPath. Returns whether it was found. */
    selectTrack: (folderId: string, track: Track | string) => boolean;
    setShuffleEnabled: (enabled: boolean) => void;
    toggleShuffle: () => void;
    requestPlay: () => boolean;
    requestPause: () => void;
    togglePlayPause: () => boolean;
    requestNext: () => boolean;
    requestPrevious: () => PreviousRequestResult;
    requestSeek: (seconds: number) => void;
    setCurrentTime: (seconds: number) => void;
    setDuration: (seconds: number) => void;
    setVolume: (volume: number) => void;
    setMuted: (muted: boolean) => void;
    toggleMuted: () => void;
    clearError: () => void;
    setPlaybackError: (message: string) => void;
    onAudioPlay: () => void;
    onAudioPause: () => void;
    onAudioWaiting: () => void;
    onAudioCanPlay: () => void;
    onAudioEnded: () => boolean;
    syncAudioVolume: (volume: number, muted: boolean) => void;
}

export type PlayerStore = PlayerDataState & PlayerActions;

const initialState: PlayerDataState = {
    ...EMPTY_QUEUE_STATE,
    library: null,
    libraryStatus: 'idle',
    libraryError: null,
    activeView: 'folder',
    selectedFolderId: null,
    queueFolderId: null,
    isPlaying: false,
    playbackIntent: false,
    playbackStatus: 'idle',
    currentTime: 0,
    duration: 0,
    volume: 0.75,
    muted: false,
    error: null,
    trackRequestId: 0,
    playRequestId: 0,
    seekRequestId: 0,
    seekTarget: 0,
    libraryRequestId: 0,
};

function boundedNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        return min;
    }

    return Math.min(Math.max(value, min), max);
}

function playableDuration(duration: number): number {
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

function queueFields(queueState: QueueNavigationState): QueueNavigationState {
    return {
        queue: queueState.queue,
        currentIndex: queueState.currentIndex,
        shuffleEnabled: queueState.shuffleEnabled,
        shuffleHistory: queueState.shuffleHistory,
        shuffleHistoryIndex: queueState.shuffleHistoryIndex,
        shuffleRemaining: queueState.shuffleRemaining,
    };
}

function sourceChangeFields(
    state: PlayerDataState,
    queueState: QueueNavigationState,
): Partial<PlayerDataState> {
    return {
        ...queueFields(queueState),
        isPlaying: false,
        playbackStatus: state.playbackIntent ? 'loading' : 'paused',
        currentTime: 0,
        duration: 0,
        seekTarget: 0,
        seekRequestId: state.seekRequestId + 1,
        error: null,
        trackRequestId: state.trackRequestId + 1,
    };
}

function clearQueueFields(state: PlayerDataState): Partial<PlayerDataState> {
    return {
        ...queueFields(EMPTY_QUEUE_STATE),
        queueFolderId: null,
        isPlaying: false,
        playbackIntent: false,
        playbackStatus: 'idle',
        currentTime: 0,
        duration: 0,
        seekTarget: 0,
        seekRequestId: state.seekRequestId + 1,
        trackRequestId: state.trackRequestId + 1,
        error: null,
    };
}

function selectedFolderForLibrary(
    library: Library,
    currentFolderId: string | null,
): string | null {
    if (
        currentFolderId &&
        library.folders.some((folder) => folder.id === currentFolderId)
    ) {
        return currentFolderId;
    }

    return library.folders[library.folders.length - 1]?.id ?? null;
}

function mostRecentPlayableFolder(library: Library): LibraryFolder | undefined {
    for (let index = library.folders.length - 1; index >= 0; index -= 1) {
        const folder = library.folders[index];
        if (folder.tracks.length > 0) {
            return folder;
        }
    }

    return undefined;
}

function initialTrackFields(
    library: Library,
    state: PlayerDataState,
): Partial<PlayerDataState> {
    const folder = mostRecentPlayableFolder(library);
    if (!folder) {
        return clearQueueFields(state);
    }

    return {
        ...queueFields(createQueueState(folder.tracks, 0, state.shuffleEnabled)),
        queueFolderId: folder.id,
        isPlaying: false,
        playbackIntent: false,
        playbackStatus: 'paused',
        currentTime: 0,
        duration: 0,
        seekTarget: 0,
        seekRequestId: state.seekRequestId + 1,
        trackRequestId: state.trackRequestId + 1,
        error: null,
    };
}

export const usePlayerStore = create<PlayerStore>()((set, get) => ({
    ...initialState,

    loadLibrary: async (config = getRuntimeConfig()) => {
        const requestId = get().libraryRequestId + 1;
        set({
            libraryStatus: 'loading',
            libraryError: null,
            libraryRequestId: requestId,
        });

        try {
            const library = await fetchLibrary(config);
            if (get().libraryRequestId !== requestId) {
                return;
            }

            get().setLibrary(library);
        } catch (cause) {
            if (get().libraryRequestId !== requestId) {
                return;
            }

            const message =
                cause instanceof Error
                    ? cause.message
                    : 'The music library could not be loaded.';
            const state = get();
            set({
                library: null,
                libraryStatus: 'error',
                libraryError: message,
                activeView: 'folder',
                selectedFolderId: null,
                ...clearQueueFields(state),
            });
        }
    },

    setLibrary: (library) => {
        const state = get();
        const mostRecentFolder = mostRecentPlayableFolder(library);
        set({
            library,
            libraryStatus: library.folders.length === 0 ? 'empty' : 'ready',
            libraryError: null,
            selectedFolderId:
                mostRecentFolder?.id ??
                selectedFolderForLibrary(library, state.selectedFolderId),
            ...initialTrackFields(library, state),
        });
    },

    selectFolder: (folderId) => {
        const state = get();
        if (!getFolder(state.library, folderId)) {
            return;
        }

        set({ activeView: 'folder', selectedFolderId: folderId });
    },

    selectFavorites: () => set({ activeView: 'favorites' }),

    selectTrack: (folderId, trackInput) => {
        const state = get();
        const folder = getFolder(state.library, folderId);
        if (!folder) {
            return false;
        }

        const audioPath =
            typeof trackInput === 'string' ? trackInput : trackInput.audioPath;
        const selectedIndex = folder.tracks.findIndex(
            (track) => track.audioPath === audioPath,
        );
        if (selectedIndex === -1) {
            return false;
        }

        const queueState = createQueueState(
            folder.tracks,
            selectedIndex,
            state.shuffleEnabled,
        );
        set({
            selectedFolderId:
                state.activeView === 'folder'
                    ? folderId
                    : state.selectedFolderId,
            queueFolderId: folderId,
            ...queueFields(queueState),
            isPlaying: false,
            playbackIntent: true,
            playbackStatus: 'loading',
            currentTime: 0,
            duration: 0,
            seekTarget: 0,
            seekRequestId: state.seekRequestId + 1,
            error: null,
            trackRequestId: state.trackRequestId + 1,
            playRequestId: state.playRequestId + 1,
        });
        return true;
    },

    setShuffleEnabled: (enabled) => {
        const state = get();
        const queueState = withShuffleEnabled(state, enabled);
        set(queueFields(queueState));
    },

    toggleShuffle: () => {
        const state = get();
        const queueState = withShuffleEnabled(state, !state.shuffleEnabled);
        set(queueFields(queueState));
    },

    requestPlay: () => {
        const state = get();
        if (!getCurrentTrack(state)) {
            return false;
        }

        const shouldRestart =
            state.duration > 0 && state.currentTime >= state.duration;
        set({
            playbackIntent: true,
            playbackStatus: state.isPlaying ? 'playing' : 'loading',
            error: null,
            playRequestId: state.playRequestId + 1,
            ...(shouldRestart
                ? {
                      currentTime: 0,
                      seekTarget: 0,
                      seekRequestId: state.seekRequestId + 1,
                  }
                : {}),
        });
        return true;
    },

    requestPause: () => {
        const state = get();
        if (!getCurrentTrack(state)) {
            return;
        }

        set({
            playbackIntent: false,
            isPlaying: false,
            playbackStatus: 'paused',
            playRequestId: state.playRequestId + 1,
        });
    },

    togglePlayPause: () => {
        const state = get();
        return state.isPlaying || state.playbackIntent
            ? (get().requestPause(), false)
            : get().requestPlay();
    },

    requestNext: () => {
        const state = get();
        const nextQueueState = getNextQueueState(state);
        if (!nextQueueState) {
            return false;
        }

        set(sourceChangeFields(state, nextQueueState));
        return true;
    },

    requestPrevious: () => {
        const state = get();
        if (!getCurrentTrack(state)) {
            return 'none';
        }

        if (state.currentTime > PREVIOUS_RESTART_THRESHOLD_SECONDS) {
            set({
                currentTime: 0,
                seekTarget: 0,
                seekRequestId: state.seekRequestId + 1,
            });
            return 'restarted';
        }

        const previousQueueState = getPreviousQueueState(state);
        if (previousQueueState) {
            set(sourceChangeFields(state, previousQueueState));
            return 'moved';
        }

        // At the beginning of a queue/history, Previous still gives a useful
        // restart action instead of doing nothing.
        set({
            currentTime: 0,
            seekTarget: 0,
            seekRequestId: state.seekRequestId + 1,
        });
        return 'restarted';
    },

    requestSeek: (seconds) => {
        const state = get();
        if (!getCurrentTrack(state)) {
            return;
        }

        const duration = playableDuration(state.duration);
        const target = boundedNumber(
            seconds,
            0,
            duration || Number.MAX_SAFE_INTEGER,
        );
        set({
            currentTime: target,
            seekTarget: target,
            seekRequestId: state.seekRequestId + 1,
        });
    },

    setCurrentTime: (seconds) => {
        const state = get();
        const duration = playableDuration(state.duration);
        set({
            currentTime: boundedNumber(
                seconds,
                0,
                duration || Number.MAX_SAFE_INTEGER,
            ),
        });
    },

    setDuration: (seconds) => {
        const duration = playableDuration(seconds);
        const state = get();
        set({
            duration,
            currentTime: boundedNumber(
                state.currentTime,
                0,
                duration || Number.MAX_SAFE_INTEGER,
            ),
        });
    },

    setVolume: (volume) => {
        const nextVolume = boundedNumber(volume, 0, 1);
        set((state) => ({
            volume: nextVolume,
            muted: nextVolume > 0 ? false : state.muted,
        }));
    },

    setMuted: (muted) => set({ muted }),

    toggleMuted: () => set((state) => ({ muted: !state.muted })),

    clearError: () => set({ error: null }),

    setPlaybackError: (message) => {
        const state = get();
        set({
            error: message,
            isPlaying: false,
            playbackIntent: false,
            playbackStatus: 'error',
            playRequestId: state.playRequestId + 1,
        });
    },

    onAudioPlay: () =>
        set({
            isPlaying: true,
            playbackIntent: true,
            playbackStatus: 'playing',
            error: null,
        }),

    onAudioPause: () => {
        const state = get();
        if (state.playbackStatus === 'error') {
            return;
        }

        // requestPause has already removed intent. If an external pause occurs,
        // preserve intent so a source transition can continue its active session.
        set({
            isPlaying: false,
            playbackStatus: state.playbackIntent ? 'loading' : 'paused',
        });
    },

    onAudioWaiting: () => {
        const state = get();
        if (state.playbackIntent) {
            set({ playbackStatus: 'buffering' });
        }
    },

    onAudioCanPlay: () => {
        const state = get();
        if (state.playbackIntent && !state.isPlaying) {
            set({ playbackStatus: 'loading' });
        }
    },

    onAudioEnded: () => {
        const state = get();
        if (!getCurrentTrack(state)) {
            return false;
        }

        if (!state.playbackIntent) {
            set({ isPlaying: false, playbackStatus: 'ended' });
            return false;
        }

        const nextQueueState = getNextQueueState(state);
        if (!nextQueueState) {
            set({
                isPlaying: false,
                playbackIntent: false,
                playbackStatus: 'ended',
                currentTime: state.duration,
            });
            return false;
        }

        set(sourceChangeFields(state, nextQueueState));
        return true;
    },

    syncAudioVolume: (volume, muted) => {
        set({ volume: boundedNumber(volume, 0, 1), muted });
    },
}));

export const selectCurrentTrack = (state: PlayerDataState): Track | null =>
    getCurrentTrack(state);

export const selectSelectedFolder = (
    state: PlayerDataState,
): LibraryFolder | null => getFolder(state.library, state.selectedFolderId);

export const selectQueueFolder = (
    state: PlayerDataState,
): LibraryFolder | null => getFolder(state.library, state.queueFolderId);
