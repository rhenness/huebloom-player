import type { Library } from '../../types';
import { selectCurrentTrack, usePlayerStore } from '../store';

const library: Library = {
    folders: [
        {
            id: '2026',
            name: '2026',
            tracks: [
                {
                    title: 'First',
                    filename: 'First.mp3',
                    audioPath: 'music/2026/First.mp3',
                    isFavorite: false,
                    shareId: 'f269405a-71aa-4bcd-8a83-c474b9a8efbb',
                },
                {
                    title: 'Second',
                    filename: 'Second.mp3',
                    audioPath: 'music/2026/Second.mp3',
                    isFavorite: false,
                    shareId: 'df76c96c-6067-4b82-b3c9-d1ee0fa7c267',
                },
            ],
        },
    ],
};

describe('player store initial selection', () => {
    it('selects the first playable track without starting playback', () => {
        usePlayerStore.getState().setLibrary(library);

        const state = usePlayerStore.getState();
        expect(selectCurrentTrack(state)?.title).toBe('First');
        expect(state.queueFolderId).toBe('2026');
        expect(state.selectedFolderId).toBe('2026');
        expect(state.playbackIntent).toBe(false);
        expect(state.isPlaying).toBe(false);
        expect(state.playbackStatus).toBe('paused');
    });

    it('loads the most recent playable folder', () => {
        const multiYearLibrary: Library = {
            folders: [
                {
                    id: '2025',
                    name: '2025',
                    tracks: [
                        {
                            title: 'Older',
                            filename: 'Older.mp3',
                            audioPath: 'music/2025/Older.mp3',
                            isFavorite: false,
                            shareId: 'ddf2ffec-7e69-4f4e-ae96-af6e65f85e61',
                        },
                    ],
                },
                ...library.folders,
            ],
        };

        usePlayerStore.getState().setLibrary(multiYearLibrary);

        const state = usePlayerStore.getState();
        expect(state.selectedFolderId).toBe('2026');
        expect(state.queueFolderId).toBe('2026');
        expect(selectCurrentTrack(state)?.title).toBe('First');
    });

    it('prefers a playable top-level folder over its nested descendants', () => {
        const nestedLibrary: Library = {
            folders: [
                ...library.folders,
                {
                    id: '2026/drop-quest',
                    name: 'drop-quest',
                    tracks: [
                        {
                            title: 'Drop',
                            filename: 'Drop.mp3',
                            audioPath: 'music/2026/drop-quest/Drop.mp3',
                            isFavorite: false,
                            shareId: '2c637683-e955-49fc-8df1-84f78e3faf05',
                        },
                    ],
                },
            ],
        };

        usePlayerStore.getState().setLibrary(nestedLibrary);

        const state = usePlayerStore.getState();
        expect(state.selectedFolderId).toBe('2026');
        expect(state.queueFolderId).toBe('2026');
        expect(selectCurrentTrack(state)?.title).toBe('First');
    });

    it('falls back to a playable descendant when roots are containers', () => {
        const nestedLibrary: Library = {
            folders: [
                { id: '2026', name: '2026', tracks: [] },
                {
                    id: '2026/drop-quest',
                    name: 'drop-quest',
                    tracks: library.folders[0].tracks,
                },
            ],
        };

        usePlayerStore.getState().setLibrary(nestedLibrary);

        const state = usePlayerStore.getState();
        expect(state.selectedFolderId).toBe('2026/drop-quest');
        expect(state.queueFolderId).toBe('2026/drop-quest');
    });
});

describe('player store end-of-track behavior', () => {
    beforeEach(() => {
        usePlayerStore.getState().setLibrary(library);
    });

    it('keeps playback intent and advances to the next track when audio ends', () => {
        const store = usePlayerStore.getState();
        store.selectTrack('2026', library.folders[0].tracks[0]);
        store.onAudioPlay();

        const advanced = usePlayerStore.getState().onAudioEnded();
        const state = usePlayerStore.getState();

        expect(advanced).toBe(true);
        expect(selectCurrentTrack(state)?.title).toBe('Second');
        expect(state.playbackIntent).toBe(true);
        expect(state.playbackStatus).toBe('loading');
    });

    it('stops cleanly when the final track ends', () => {
        const store = usePlayerStore.getState();
        store.selectTrack('2026', library.folders[0].tracks[1]);
        store.onAudioPlay();

        const advanced = usePlayerStore.getState().onAudioEnded();
        const state = usePlayerStore.getState();

        expect(advanced).toBe(false);
        expect(selectCurrentTrack(state)?.title).toBe('Second');
        expect(state.playbackIntent).toBe(false);
        expect(state.playbackStatus).toBe('ended');
    });
});
