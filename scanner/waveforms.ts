import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
    copyFile,
    mkdir,
    readFile,
    rename,
    rm,
    writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { LibraryValidationError, parseLibrary, type Track } from './library';

const execFileAsync = promisify(execFile);
const waveformVersion = 1;
const waveformBits = 8;
const waveformPixelsPerSecond = 20;
const defaultConcurrency = 4;

export interface WaveformData {
    version: 1;
    duration: number;
    scale: 128;
    peaks: number[];
}

interface WaveformCacheEntry {
    audioPath: string;
    sourceHash: string;
}

interface WaveformCache {
    version: 1;
    bits: 8;
    pixelsPerSecond: 20;
    tracks: Record<string, WaveformCacheEntry>;
}

export type WaveformCommandRunner = (
    executable: string,
    argumentsList: readonly string[],
) => Promise<void>;

export interface GenerateWaveformsOptions {
    repositoryRoot?: string;
    executable?: string;
    runCommand?: WaveformCommandRunner;
    concurrency?: number;
}

export interface GenerateWaveformsResult {
    generated: number;
    reused: number;
    removed: number;
}

export class WaveformError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'WaveformError';
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown, field: string): number {
    if (!Number.isSafeInteger(value) || Number(value) <= 0) {
        throw new WaveformError(
            `audiowaveform ${field} must be a positive integer.`,
        );
    }

    return Number(value);
}

function isWithinDirectory(
    candidatePath: string,
    directoryPath: string,
): boolean {
    const relativePath = path.relative(directoryPath, candidatePath);

    return (
        relativePath.length > 0 &&
        relativePath !== '..' &&
        !relativePath.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relativePath)
    );
}

export function parseWaveformData(contents: string): WaveformData {
    let value: unknown;

    try {
        value = JSON.parse(contents);
    } catch {
        throw new WaveformError('Waveform data contains invalid JSON.');
    }

    if (
        !isRecord(value) ||
        value.version !== waveformVersion ||
        typeof value.duration !== 'number' ||
        !Number.isFinite(value.duration) ||
        value.duration <= 0 ||
        value.scale !== 128 ||
        !Array.isArray(value.peaks) ||
        value.peaks.length === 0 ||
        value.peaks.length % 2 !== 0 ||
        value.peaks.some(
            (sample) =>
                !Number.isInteger(sample) ||
                Number(sample) < -128 ||
                Number(sample) > 127,
        )
    ) {
        throw new WaveformError('Waveform data is invalid.');
    }

    return value as unknown as WaveformData;
}

export function parseAudiowaveformOutput(contents: string): WaveformData {
    let value: unknown;

    try {
        value = JSON.parse(contents);
    } catch {
        throw new WaveformError('audiowaveform returned invalid JSON.');
    }

    if (!isRecord(value)) {
        throw new WaveformError('audiowaveform output must be an object.');
    }

    const version = positiveInteger(value.version, 'version');
    if (version !== 1 && version !== 2) {
        throw new WaveformError(
            `Unsupported audiowaveform version: ${version}.`,
        );
    }

    const channels =
        version === 1 ? 1 : positiveInteger(value.channels, 'channels');
    if (channels !== 1) {
        throw new WaveformError(
            'audiowaveform output must contain one combined channel.',
        );
    }

    if (value.bits !== waveformBits) {
        throw new WaveformError('audiowaveform output must use 8-bit samples.');
    }

    const sampleRate = positiveInteger(value.sample_rate, 'sample_rate');
    const samplesPerPixel = positiveInteger(
        value.samples_per_pixel,
        'samples_per_pixel',
    );
    const length = positiveInteger(value.length, 'length');

    if (
        !Array.isArray(value.data) ||
        value.data.length !== length * channels * 2
    ) {
        throw new WaveformError(
            'audiowaveform data length does not match its metadata.',
        );
    }

    const peaks = value.data.map((sample) => {
        if (
            !Number.isInteger(sample) ||
            Number(sample) < -128 ||
            Number(sample) > 127
        ) {
            throw new WaveformError(
                'audiowaveform data must contain signed 8-bit integers.',
            );
        }

        return Number(sample);
    });

    return {
        version: waveformVersion,
        duration: (length * samplesPerPixel) / sampleRate,
        scale: 128,
        peaks,
    };
}

async function defaultCommandRunner(
    executable: string,
    argumentsList: readonly string[],
): Promise<void> {
    await execFileAsync(executable, [...argumentsList], { windowsHide: true });
}

async function hashFile(filePath: string): Promise<string> {
    const hash = createHash('sha256');

    for await (const chunk of createReadStream(filePath)) {
        hash.update(chunk as Buffer);
    }

    return hash.digest('hex');
}

function emptyCache(): WaveformCache {
    return {
        version: waveformVersion,
        bits: waveformBits,
        pixelsPerSecond: waveformPixelsPerSecond,
        tracks: {},
    };
}

async function readCache(cachePath: string): Promise<WaveformCache> {
    try {
        const value: unknown = JSON.parse(await readFile(cachePath, 'utf8'));

        if (
            !isRecord(value) ||
            value.version !== waveformVersion ||
            value.bits !== waveformBits ||
            value.pixelsPerSecond !== waveformPixelsPerSecond ||
            !isRecord(value.tracks)
        ) {
            return emptyCache();
        }

        return value as unknown as WaveformCache;
    } catch {
        return emptyCache();
    }
}

async function readTracks(repositoryRoot: string): Promise<Track[]> {
    try {
        const library = parseLibrary(
            await readFile(path.join(repositoryRoot, 'library.json'), 'utf8'),
        );
        return library.folders.flatMap((folder) => folder.tracks);
    } catch (error) {
        if (error instanceof LibraryValidationError) {
            throw new WaveformError(
                `Cannot generate waveforms: ${error.message}`,
            );
        }

        throw new WaveformError(
            `Unable to read library.json: ${String(error)}`,
        );
    }
}

async function runWithConcurrency<T>(
    values: readonly T[],
    concurrency: number,
    operation: (value: T) => Promise<void>,
): Promise<void> {
    let nextIndex = 0;

    async function worker(): Promise<void> {
        while (nextIndex < values.length) {
            const value = values[nextIndex];
            nextIndex += 1;
            await operation(value);
        }
    }

    await Promise.all(
        Array.from(
            { length: Math.min(concurrency, values.length) },
            () => worker(),
        ),
    );
}

export async function generateWaveforms(
    options: GenerateWaveformsOptions = {},
): Promise<GenerateWaveformsResult> {
    const repositoryRoot = path.resolve(
        options.repositoryRoot ?? path.resolve(__dirname, '..'),
    );
    const waveformDirectory = path.join(repositoryRoot, '.waveforms');
    const existingDataDirectory = path.join(waveformDirectory, 'data');
    const temporaryDirectory = path.join(
        repositoryRoot,
        `.waveforms.tmp-${process.pid}-${randomUUID()}`,
    );
    const temporaryDataDirectory = path.join(temporaryDirectory, 'data');
    const temporaryRawDirectory = path.join(temporaryDirectory, 'raw');
    const executable =
        options.executable ??
        process.env.AUDIOWAVEFORM_BIN ??
        'audiowaveform';
    const runCommand = options.runCommand ?? defaultCommandRunner;
    const concurrency = options.concurrency ?? defaultConcurrency;

    if (!Number.isSafeInteger(concurrency) || concurrency <= 0) {
        throw new WaveformError(
            'Waveform concurrency must be a positive integer.',
        );
    }

    const tracks = await readTracks(repositoryRoot);
    const existingCache = await readCache(
        path.join(waveformDirectory, 'cache.json'),
    );
    const nextCache = emptyCache();
    let generated = 0;
    let reused = 0;

    await mkdir(temporaryDataDirectory, { recursive: true });
    await mkdir(temporaryRawDirectory, { recursive: true });

    try {
        await runWithConcurrency(tracks, concurrency, async (track) => {
            const audioFilePath = path.resolve(repositoryRoot, track.audioPath);
            if (!isWithinDirectory(audioFilePath, repositoryRoot)) {
                throw new WaveformError(
                    `Track path escapes the repository: ${track.audioPath}.`,
                );
            }

            let sourceHash: string;
            try {
                sourceHash = await hashFile(audioFilePath);
            } catch (error) {
                throw new WaveformError(
                    `Unable to read ${track.audioPath}: ${String(error)}`,
                );
            }

            const sidecarName = `${track.shareId}.json`;
            const existingSidecarPath = path.join(
                existingDataDirectory,
                sidecarName,
            );
            const temporarySidecarPath = path.join(
                temporaryDataDirectory,
                sidecarName,
            );
            const existingEntry = existingCache.tracks[track.shareId];

            if (
                existingEntry?.audioPath === track.audioPath &&
                existingEntry.sourceHash === sourceHash
            ) {
                try {
                    parseWaveformData(
                        await readFile(existingSidecarPath, 'utf8'),
                    );
                    await copyFile(existingSidecarPath, temporarySidecarPath);
                    nextCache.tracks[track.shareId] = {
                        audioPath: track.audioPath,
                        sourceHash,
                    };
                    reused += 1;
                    return;
                } catch {
                    // Missing or damaged cached data is regenerated below.
                }
            }

            const rawOutputPath = path.join(
                temporaryRawDirectory,
                sidecarName,
            );
            try {
                await runCommand(executable, [
                    '--input-filename',
                    audioFilePath,
                    '--output-filename',
                    rawOutputPath,
                    '--output-format',
                    'json',
                    '--bits',
                    String(waveformBits),
                    '--pixels-per-second',
                    String(waveformPixelsPerSecond),
                    '--quiet',
                ]);
            } catch (error) {
                throw new WaveformError(
                    `Unable to generate waveform for ${track.audioPath}: ${String(error)}`,
                );
            }

            const waveform = parseAudiowaveformOutput(
                await readFile(rawOutputPath, 'utf8'),
            );
            await writeFile(
                temporarySidecarPath,
                `${JSON.stringify(waveform)}\n`,
                'utf8',
            );
            nextCache.tracks[track.shareId] = {
                audioPath: track.audioPath,
                sourceHash,
            };
            generated += 1;
        });

        await rm(temporaryRawDirectory, { recursive: true, force: true });
        await writeFile(
            path.join(temporaryDirectory, 'cache.json'),
            `${JSON.stringify(nextCache, null, 2)}\n`,
            'utf8',
        );
        await rm(waveformDirectory, { recursive: true, force: true });
        await rename(temporaryDirectory, waveformDirectory);
    } catch (error) {
        await rm(temporaryDirectory, { recursive: true, force: true });
        throw error instanceof WaveformError
            ? error
            : new WaveformError(
                  `Unable to generate waveforms: ${String(error)}`,
              );
    }

    const currentShareIds = new Set(tracks.map((track) => track.shareId));
    const removed = Object.keys(existingCache.tracks).filter(
        (shareId) => !currentShareIds.has(shareId),
    ).length;

    return { generated, reused, removed };
}

async function main(): Promise<void> {
    const result = await generateWaveforms();
    console.log(
        `Waveforms ready: ${result.generated} generated, ${result.reused} reused, ${result.removed} removed.`,
    );
}

if (require.main === module) {
    main().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`waveform generation failed: ${message}`);
        process.exitCode = 1;
    });
}