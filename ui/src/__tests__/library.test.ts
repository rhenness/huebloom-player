import {
    buildFolderTree,
    getFavoriteTracks,
    getFolderPathLabel,
    getTrackByShareId,
    isFolderInSelectedBranch,
} from '../library';
import type { Library } from '../types';

describe('getFavoriteTracks', () => {
    it('flattens favorited tracks while preserving their source folders', () => {
        const library: Library = {
            folders: [
                {
                    id: '2025',
                    name: '2025',
                    tracks: [
                        {
                            title: 'Not saved',
                            filename: 'Not saved.mp3',
                            audioPath: 'music/2025/Not saved.mp3',
                            isFavorite: false,
                            shareId: '069cbf64-cd51-4417-a88b-1b4ecba4e6eb',
                        },
                        {
                            title: 'Saved 2025',
                            filename: 'Saved 2025.mp3',
                            audioPath: 'music/2025/Saved 2025.mp3',
                            isFavorite: true,
                            shareId: 'c2e6ec1a-4979-4f9f-a82d-4a3b15d03f3d',
                        },
                    ],
                },
                {
                    id: '2026',
                    name: '2026',
                    tracks: [
                        {
                            title: 'Saved 2026',
                            filename: 'Saved 2026.mp3',
                            audioPath: 'music/2026/Saved 2026.mp3',
                            isFavorite: true,
                            shareId: '067bc0aa-d263-4a2c-a940-0de75f4da8f9',
                        },
                    ],
                },
            ],
        };

        expect(getFavoriteTracks(library)).toEqual([
            expect.objectContaining({
                title: 'Saved 2025',
                folderId: '2025',
                folderName: '2025',
            }),
            expect.objectContaining({
                title: 'Saved 2026',
                folderId: '2026',
                folderName: '2026',
            }),
        ]);

        expect(
            getTrackByShareId(library, '067bc0aa-d263-4a2c-a940-0de75f4da8f9'),
        ).toEqual(
            expect.objectContaining({
                title: 'Saved 2026',
                folderId: '2026',
                folderName: '2026',
            }),
        );
        expect(getTrackByShareId(library, 'missing-share-id')).toBeNull();
    });
});

describe('folder hierarchy', () => {
    const nestedLibrary: Library = {
        folders: [
            { id: '2025', name: '2025', tracks: [] },
            { id: '2026', name: '2026', tracks: [] },
            { id: '2026/drop-quest', name: 'drop-quest', tracks: [] },
            {
                id: '2026/drop-quest/alternate',
                name: 'alternate',
                tracks: [],
            },
            { id: 'archive/drop-quest', name: 'drop-quest', tracks: [] },
        ],
    };

    it('builds an arbitrary-depth tree without confusing repeated leaf names', () => {
        const roots = buildFolderTree(nestedLibrary.folders);

        expect(roots.map((node) => node.folder.id)).toEqual([
            '2025',
            '2026',
            'archive/drop-quest',
        ]);
        expect(roots[1].children[0].folder.id).toBe('2026/drop-quest');
        expect(roots[1].children[0].children[0].folder.id).toBe(
            '2026/drop-quest/alternate',
        );
    });

    it('aggregates descendant tracks into each parent count', () => {
        const track = {
            title: 'Track',
            filename: 'Track.mp3',
            audioPath: 'music/2026/Track.mp3',
            isFavorite: false,
            shareId: '067bc0aa-d263-4a2c-a940-0de75f4da8f9',
        };
        const roots = buildFolderTree([
            { id: '2026', name: '2026', tracks: [track] },
            {
                id: '2026/drop-quest',
                name: 'drop-quest',
                tracks: [track, track],
            },
        ]);

        expect(roots[0].totalTrackCount).toBe(3);
        expect(roots[0].children[0].totalTrackCount).toBe(2);
    });

    it('identifies only the exact selected folder and its ancestors as the open branch', () => {
        expect(
            isFolderInSelectedBranch('2026', '2026/drop-quest/alternate'),
        ).toBe(true);
        expect(
            isFolderInSelectedBranch(
                '2026/drop-quest',
                '2026/drop-quest/alternate',
            ),
        ).toBe(true);
        expect(
            isFolderInSelectedBranch('2026/drop', '2026/drop-quest/alternate'),
        ).toBe(false);
    });

    it('builds an unambiguous label from folder ancestry', () => {
        expect(
            getFolderPathLabel(nestedLibrary, '2026/drop-quest/alternate'),
        ).toBe('2026 / drop-quest / alternate');
        expect(getFolderPathLabel(nestedLibrary, 'archive/drop-quest')).toBe(
            'archive / drop-quest',
        );
    });
});
