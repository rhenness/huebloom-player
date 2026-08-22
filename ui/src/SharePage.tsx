import { useEffect, useMemo, useState } from 'react';
import { CircleAlert, LoaderCircle } from 'lucide-react';

import { DefaultArtwork, ShareTrackPlayer } from './components';
import {
    getRuntimeConfig,
    resolveTrackUrl,
    resolveWaveformUrl,
} from './config';
import { getTrackByShareId, loadLibrary } from './library';
import type { RuntimeConfig } from './types';

type SharePageStatus = 'loading' | 'ready' | 'not-found' | 'error';

interface SharePageState {
    status: SharePageStatus;
    track: ReturnType<typeof getTrackByShareId>;
    error: string | null;
}

const initialState: SharePageState = {
    status: 'loading',
    track: null,
    error: null,
};

function errorMessage(error: unknown): string {
    return error instanceof Error
        ? error.message
        : 'The shared track could not be loaded.';
}

export interface SharePageProps {
    /** Opaque ID taken from the final `/share/{id}` path segment. */
    shareId: string;
}

/**
 * A deliberately self-contained listening page for one shared track. It does
 * not initialize the normal player store, queue, sidebar, or library shell.
 */
export default function SharePage({ shareId }: SharePageProps) {
    const config = useMemo<RuntimeConfig>(() => getRuntimeConfig(), []);
    const [state, setState] = useState<SharePageState>(initialState);

    useEffect(() => {
        let cancelled = false;

        setState(initialState);

        void loadLibrary(config)
            .then((library) => {
                if (cancelled) {
                    return;
                }

                const track = getTrackByShareId(library, shareId);
                setState({
                    status: track ? 'ready' : 'not-found',
                    track,
                    error: null,
                });
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setState({
                        status: 'error',
                        track: null,
                        error: errorMessage(error),
                    });
                }
            });

        return () => {
            cancelled = true;
        };
    }, [config, shareId]);

    useEffect(() => {
        const title =
            state.status === 'ready' && state.track
                ? `Huebloom shared a track | ${state.track.title}`
                : 'Huebloom shared a track';

        document.title = title;
    }, [state.status, state.track]);

    const trackUrl =
        state.status === 'ready' && state.track
            ? resolveTrackUrl(state.track, config)
            : null;

    return (
        <main className="share-page">
            <section
                aria-busy={state.status === 'loading'}
                aria-label="Shared track"
                className="share-card">
                <p className="share-card__brand">huebloom</p>

                {state.status === 'loading' ? (
                    <div
                        aria-live="polite"
                        className="share-card__state"
                        role="status">
                        <LoaderCircle
                            aria-hidden="true"
                            className="share-card__spinner"
                            size={30}
                        />
                        <p>Loading shared track…</p>
                    </div>
                ) : null}

                {state.status === 'not-found' ? (
                    <div className="share-card__state" role="alert">
                        <CircleAlert aria-hidden="true" size={30} />
                        <h1 id="share-page-title">
                            This shared track is unavailable
                        </h1>
                        <p>
                            It may have been removed or this link may be
                            incomplete.
                        </p>
                    </div>
                ) : null}

                {state.status === 'error' ? (
                    <div
                        className="share-card__state share-card__state--error"
                        role="alert">
                        <CircleAlert aria-hidden="true" size={30} />
                        <h1 id="share-page-title">Unable to load this track</h1>
                        <p>{state.error}</p>
                    </div>
                ) : null}

                {state.status === 'ready' && state.track && trackUrl ? (
                    <div className="share-card__track">
                        <div aria-hidden="true" className="share-card__artwork">
              <DefaultArtwork size={100} />
                        </div>

                        <p className="share-card__eyebrow">Shared track</p>
                        <h1 id="share-page-title">{state.track.title}</h1>

                        <dl className="share-card__details">
                            <div>
                                <dt>Year</dt>
                                <dd>{state.track.folderName}</dd>
                            </div>
                            <div>
                                <dt>File</dt>
                                <dd title={state.track.filename}>
                                    {state.track.filename}
                                </dd>
                            </div>
                        </dl>

                        <ShareTrackPlayer
                            key={trackUrl}
                            src={trackUrl}
                            trackTitle={state.track.title}
                            waveformUrl={resolveWaveformUrl(state.track, config)}
                        />
                    </div>
                ) : null}
            </section>
        </main>
    );
}
