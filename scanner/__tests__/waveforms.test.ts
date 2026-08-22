import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
    generateWaveforms,
    WaveformError,
    parseAudiowaveformOutput,
    type WaveformCommandRunner,
} from '../waveforms';

const shareId = 'dc3268f1-1c91-4f2a-8e2d-cd79913e5ba9';

async function writeFixtureFile(
    repositoryRoot: string,
    relativePath: string,
    contents: string,
): Promise<void> {
    const filePath = path.join(repositoryRoot, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents, 'utf8');
}

async function writeFixtureLibrary(
    repositoryRoot: string,
    includeTrack = true,
): Promise<void> {
    await writeFixtureFile(
        repositoryRoot,
        'library.json',
        `${JSON.stringify({
            folders: includeTrack
                ? [
                      {
                          id: '2026',
                          name: '2026',
                          tracks: [
                              {
                                  filename: 'Track.mp3',
                                  title: 'Track',
                                  audioPath: 'music/2026/Track.mp3',
                                  isFavorite: false,
                                  shareId,
                              },
                          ],
                      },
                  ]
                : [],
        })}\n`,
    );
}

function successfulRunner(calls: string[][]): WaveformCommandRunner {
    return async (_executable, argumentsList) => {
        const argumentsArray = [...argumentsList];
        calls.push(argumentsArray);
        const outputIndex = argumentsArray.indexOf('--output-filename');
        await writeFile(
            argumentsArray[outputIndex + 1],
            JSON.stringify({
                version: 1,
                sample_rate: 48_000,
                samples_per_pixel: 2_400,
                bits: 8,
                length: 2,
                data: [-64, 63, -32, 31],
            }),
            'utf8',
        );
    };
}

describe('parseAudiowaveformOutput', () => {
    it('converts version 1 mono output to the Huebloom sidecar format', () => {
        expect(
            parseAudiowaveformOutput(
                JSON.stringify({
                    version: 1,
                    sample_rate: 48_000,
                    samples_per_pixel: 2_400,
                    bits: 8,
                    length: 3,
                    data: [-65, 63, -40, 41, -55, 43],
                }),
            ),
        ).toEqual({
            version: 1,
            duration: 0.15,
            scale: 128,
            peaks: [-65, 63, -40, 41, -55, 43],
        });
    });

    it('accepts version 2 output when it contains one combined channel', () => {
        expect(
            parseAudiowaveformOutput(
                JSON.stringify({
                    version: 2,
                    channels: 1,
                    sample_rate: 44_100,
                    samples_per_pixel: 2_205,
                    bits: 8,
                    length: 2,
                    data: [-128, 127, -1, 1],
                }),
            ),
        ).toMatchObject({ duration: 0.1, peaks: [-128, 127, -1, 1] });
    });

    it.each([
        ['invalid JSON', '{'],
        [
            'unsupported sample resolution',
            JSON.stringify({
                version: 1,
                sample_rate: 48_000,
                samples_per_pixel: 2_400,
                bits: 16,
                length: 1,
                data: [-1, 1],
            }),
        ],
        [
            'inconsistent data length',
            JSON.stringify({
                version: 1,
                sample_rate: 48_000,
                samples_per_pixel: 2_400,
                bits: 8,
                length: 2,
                data: [-1, 1],
            }),
        ],
        [
            'out-of-range samples',
            JSON.stringify({
                version: 1,
                sample_rate: 48_000,
                samples_per_pixel: 2_400,
                bits: 8,
                length: 1,
                data: [-129, 1],
            }),
        ],
        [
            'split channels',
            JSON.stringify({
                version: 2,
                channels: 2,
                sample_rate: 48_000,
                samples_per_pixel: 2_400,
                bits: 8,
                length: 1,
                data: [-1, 1, -2, 2],
            }),
        ],
    ])('rejects %s', (_description, contents) => {
        expect(() => parseAudiowaveformOutput(contents)).toThrow(WaveformError);
    });
});

describe('generateWaveforms', () => {
    let repositoryRoot: string;

    beforeEach(async () => {
        repositoryRoot = await new Promise<string>((resolve, reject) => {
            require('node:fs').mkdtemp(
                path.join(tmpdir(), 'huebloom-waveforms-'),
                (error: Error | null, directory: string) =>
                    error ? reject(error) : resolve(directory),
            );
        });
        await writeFixtureLibrary(repositoryRoot);
        await writeFixtureFile(
            repositoryRoot,
            'music/2026/Track.mp3',
            'ID3 first',
        );
    });

    afterEach(async () => {
        await rm(repositoryRoot, { recursive: true, force: true });
    });

    it('generates a sidecar with the expected command and reuses unchanged audio', async () => {
        const calls: string[][] = [];
        const runCommand = successfulRunner(calls);
        const options = {
            repositoryRoot,
            runCommand,
            executable: 'test-waveform',
        };

        await expect(generateWaveforms(options)).resolves.toEqual({
            generated: 1,
            reused: 0,
            removed: 0,
        });
        await expect(generateWaveforms(options)).resolves.toEqual({
            generated: 0,
            reused: 1,
            removed: 0,
        });

        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual([
            '--input-filename',
            path.join(repositoryRoot, 'music/2026/Track.mp3'),
            '--output-filename',
            expect.stringMatching(new RegExp(`${shareId}\\.json$`)),
            '--output-format',
            'json',
            '--bits',
            '8',
            '--pixels-per-second',
            '20',
            '--quiet',
        ]);
        await expect(
            readFile(
                path.join(
                    repositoryRoot,
                    '.waveforms/data',
                    `${shareId}.json`,
                ),
                'utf8',
            ),
        ).resolves.toBe(
            `${JSON.stringify({
                version: 1,
                duration: 0.1,
                scale: 128,
                peaks: [-64, 63, -32, 31],
            })}\n`,
        );
    });

    it('regenerates changed audio and removes sidecars for deleted tracks', async () => {
        const calls: string[][] = [];
        const options = {
            repositoryRoot,
            runCommand: successfulRunner(calls),
        };
        await generateWaveforms(options);
        await writeFixtureFile(
            repositoryRoot,
            'music/2026/Track.mp3',
            'ID3 changed',
        );

        await expect(generateWaveforms(options)).resolves.toEqual({
            generated: 1,
            reused: 0,
            removed: 0,
        });

        await writeFixtureLibrary(repositoryRoot, false);
        await expect(generateWaveforms(options)).resolves.toEqual({
            generated: 0,
            reused: 0,
            removed: 1,
        });
        await expect(
            readFile(
                path.join(
                    repositoryRoot,
                    '.waveforms/data',
                    `${shareId}.json`,
                ),
                'utf8',
            ),
        ).rejects.toThrow('ENOENT');
    });

    it('keeps the previous waveform set when generation fails', async () => {
        await generateWaveforms({
            repositoryRoot,
            runCommand: successfulRunner([]),
        });
        const sidecarPath = path.join(
            repositoryRoot,
            '.waveforms/data',
            `${shareId}.json`,
        );
        const originalSidecar = await readFile(sidecarPath, 'utf8');
        await writeFixtureFile(
            repositoryRoot,
            'music/2026/Track.mp3',
            'ID3 changed',
        );

        await expect(
            generateWaveforms({
                repositoryRoot,
                runCommand: async () => {
                    throw new Error('native failure');
                },
            }),
        ).rejects.toThrow('native failure');
        await expect(readFile(sidecarPath, 'utf8')).resolves.toBe(
            originalSidecar,
        );
    });
});