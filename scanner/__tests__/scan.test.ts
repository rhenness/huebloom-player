import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ScanError, scanLibrary } from '../scan';

async function writeFixtureFile(
    repositoryRoot: string,
    relativePath: string,
    contents = 'ID3fixture',
): Promise<void> {
    const filePath = path.join(repositoryRoot, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents, 'utf8');
}

describe('scanLibrary', () => {
    let repositoryRoot: string;

    beforeEach(async () => {
        repositoryRoot = await new Promise<string>((resolve, reject) => {
            const prefix = path.join(tmpdir(), 'huebloom-scanner-');
            require('node:fs').mkdtemp(
                prefix,
                (error: Error | null, directory: string) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(directory);
                },
            );
        });
    });

    afterEach(async () => {
        await rm(repositoryRoot, { recursive: true, force: true });
    });

    it('scans direct MP3 and WAV files, ignores unrelated content, and writes a sorted manifest', async () => {
        await writeFixtureFile(repositoryRoot, 'music/2025/Project_10.mp3');
        await writeFixtureFile(repositoryRoot, 'music/2025/Project_2.MP3');
        await writeFixtureFile(repositoryRoot, 'music/2025/Project_3.WAV');
        await writeFixtureFile(
            repositoryRoot,
            'music/2025/nested/Project_3.mp3',
        );
        await writeFixtureFile(repositoryRoot, 'music/2025/notes.txt');
        await writeFixtureFile(repositoryRoot, 'music/2025/Project_4.flac');
        await writeFixtureFile(repositoryRoot, 'music/2024/Project_1.mp3');
        await writeFixtureFile(repositoryRoot, 'music/Project_99.mp3');
        await mkdir(path.join(repositoryRoot, 'music', 'empty'), {
            recursive: true,
        });

        const result = await scanLibrary({ repositoryRoot });
        const contents = await readFile(
            path.join(repositoryRoot, 'library.json'),
            'utf8',
        );

        expect(result).toMatchObject({ wasCurrent: false, written: true });
        expect(JSON.parse(contents)).toEqual({
            folders: [
                {
                    id: '2024',
                    name: '2024',
                    tracks: [
                        {
                            filename: 'Project_1.mp3',
                            title: 'Project_1',
                            audioPath: 'music/2024/Project_1.mp3',
                            isFavorite: false,
                        },
                    ],
                },
                {
                    id: '2025',
                    name: '2025',
                    tracks: [
                        {
                            filename: 'Project_2.MP3',
                            title: 'Project_2',
                            audioPath: 'music/2025/Project_2.MP3',
                            isFavorite: false,
                        },
                        {
                            filename: 'Project_3.WAV',
                            title: 'Project_3',
                            audioPath: 'music/2025/Project_3.WAV',
                            isFavorite: false,
                        },
                        {
                            filename: 'Project_10.mp3',
                            title: 'Project_10',
                            audioPath: 'music/2025/Project_10.mp3',
                            isFavorite: false,
                        },
                    ],
                },
            ],
        });
    });

    it('preserves metadata for unchanged paths and supports no-write checks', async () => {
        await writeFixtureFile(repositoryRoot, 'music/2025/Project_10.mp3');
        await writeFixtureFile(
            repositoryRoot,
            'library.json',
            JSON.stringify({
                folders: [
                    {
                        id: 'legacy',
                        name: 'legacy',
                        tracks: [
                            {
                                filename: 'Removed.mp3',
                                title: 'Removed',
                                audioPath: 'music/legacy/Removed.mp3',
                                isFavorite: false,
                            },
                        ],
                    },
                    {
                        id: '2025',
                        name: '2025',
                        tracks: [
                            {
                                filename: 'Project_10.mp3',
                                title: 'Custom title',
                                audioPath: 'music/2025/Project_10.mp3',
                                isFavorite: true,
                            },
                        ],
                    },
                ],
            }),
        );

        await scanLibrary({ repositoryRoot });

        await expect(
            scanLibrary({ repositoryRoot, check: true }),
        ).resolves.toMatchObject({
            wasCurrent: true,
            written: false,
        });

        expect(
            JSON.parse(
                await readFile(
                    path.join(repositoryRoot, 'library.json'),
                    'utf8',
                ),
            ),
        ).toEqual({
            folders: [
                {
                    id: '2025',
                    name: '2025',
                    tracks: [
                        {
                            filename: 'Project_10.mp3',
                            title: 'Custom title',
                            audioPath: 'music/2025/Project_10.mp3',
                            isFavorite: true,
                        },
                    ],
                },
            ],
        });
    });

    it('rejects unpulled Git LFS pointer files without writing a manifest', async () => {
        await writeFixtureFile(
            repositoryRoot,
            'music/2024/Project_1.mp3',
            'version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 42\n',
        );

        await expect(scanLibrary({ repositoryRoot })).rejects.toThrow(
            ScanError,
        );
        await expect(
            readFile(path.join(repositoryRoot, 'library.json'), 'utf8'),
        ).rejects.toThrow('ENOENT');
    });
});
