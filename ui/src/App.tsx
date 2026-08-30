import { useEffect, useMemo, useRef, useState } from 'react';
import { Menu } from 'lucide-react';

import { LibrarySidebar, PlayerBar, TrackTable } from './components';
import { getRuntimeConfig, resolveWaveformUrl } from './config';
import {
    buildFolderTree,
    getFavoriteTracks,
    getFolderPathLabel,
    getParentFolderId,
} from './library';
import { getNextQueueState } from './player/queue';
import {
    selectCurrentTrack,
    selectSelectedFolder,
    useAudioController,
    usePlayerStore,
} from './player';
import { getShareUrl } from './share-route';

export default function App() {
    const config = useMemo(() => getRuntimeConfig(), []);
    const [copiedShareId, setCopiedShareId] = useState<string | null>(null);
    const [isLibraryMenuOpen, setIsLibraryMenuOpen] = useState(false);
    const copiedShareReset = useRef<number | null>(null);
    const loadLibrary = usePlayerStore((state) => state.loadLibrary);
    const library = usePlayerStore((state) => state.library);
    const libraryStatus = usePlayerStore((state) => state.libraryStatus);
    const libraryError = usePlayerStore((state) => state.libraryError);
    const activeView = usePlayerStore((state) => state.activeView);
    const selectedFolderId = usePlayerStore((state) => state.selectedFolderId);
    const currentTrack = usePlayerStore(selectCurrentTrack);
    const selectedFolder = usePlayerStore(selectSelectedFolder);
    const isPlaying = usePlayerStore((state) => state.isPlaying);
    const shuffleEnabled = usePlayerStore((state) => state.shuffleEnabled);
    const currentTime = usePlayerStore((state) => state.currentTime);
    const duration = usePlayerStore((state) => state.duration);
    const volume = usePlayerStore((state) => state.volume);
    const muted = usePlayerStore((state) => state.muted);
    const selectFolder = usePlayerStore((state) => state.selectFolder);
    const selectFavorites = usePlayerStore((state) => state.selectFavorites);
    const selectTrack = usePlayerStore((state) => state.selectTrack);
    const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
    const togglePlayPause = usePlayerStore((state) => state.togglePlayPause);
    const requestNext = usePlayerStore((state) => state.requestNext);
    const requestPrevious = usePlayerStore((state) => state.requestPrevious);
    const requestSeek = usePlayerStore((state) => state.requestSeek);
    const setVolume = usePlayerStore((state) => state.setVolume);
    const toggleMuted = usePlayerStore((state) => state.toggleMuted);
    const hasNextTrack = usePlayerStore((state) =>
        Boolean(getNextQueueState(state)),
    );
    const { audioRef } = useAudioController({ config });

    useEffect(() => {
        void loadLibrary(config);
    }, [config, loadLibrary]);

    useEffect(
        () => () => {
            if (copiedShareReset.current !== null) {
                window.clearTimeout(copiedShareReset.current);
            }
        },
        [],
    );

    useEffect(() => {
        if (!isLibraryMenuOpen) {
            return;
        }

        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setIsLibraryMenuOpen(false);
            }
        }

        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [isLibraryMenuOpen]);

    const folders = library?.folders ?? [];
    const folderTree = useMemo(() => buildFolderTree(folders), [folders]);
    const tracks = selectedFolder?.tracks ?? [];
    const favoriteTracks = useMemo(() => getFavoriteTracks(library), [library]);
    const displayedTracks =
        activeView === 'favorites' ? favoriteTracks : tracks;
    const selectedFolderHasChildren = selectedFolder
        ? folders.some(
              (folder) => getParentFolderId(folder.id) === selectedFolder.id,
          )
        : false;
    const isLibraryLoading =
        libraryStatus === 'idle' || libraryStatus === 'loading';
    const libraryStatusMessage =
        libraryStatus === 'loading'
            ? 'Loading your music library...'
            : libraryStatus === 'empty'
              ? 'No playable tracks were found.'
              : null;

    function copyShareLink(shareId: string) {
        const shareUrl = getShareUrl(shareId);

        void (async () => {
            try {
                if (!navigator.clipboard) {
                    throw new Error('Clipboard access is unavailable.');
                }

                await navigator.clipboard.writeText(shareUrl);
                setCopiedShareId(shareId);

                if (copiedShareReset.current !== null) {
                    window.clearTimeout(copiedShareReset.current);
                }

                copiedShareReset.current = window.setTimeout(() => {
                    setCopiedShareId(null);
                    copiedShareReset.current = null;
                }, 2_000);
            } catch {
                window.prompt('Copy this share link:', shareUrl);
            }
        })();
    }

    return (
        <main className="app-shell">
            <LibrarySidebar
                activeFolderId={
                    activeView === 'folder' ? selectedFolderId : null
                }
                className={isLibraryMenuOpen ? 'is-mobile-open' : undefined}
                favoriteCount={favoriteTracks.length}
                folders={folderTree}
                id="library-navigation"
                isFavoritesActive={activeView === 'favorites'}
                isLoading={isLibraryLoading}
                onSelectFolder={(folderId) => {
                    selectFolder(folderId);
                    const hasChildren = folders.some(
                        (folder) => getParentFolderId(folder.id) === folderId,
                    );
                    if (!hasChildren) {
                        setIsLibraryMenuOpen(false);
                    }
                }}
                onSelectFavorites={() => {
                    selectFavorites();
                    setIsLibraryMenuOpen(false);
                }}
                status={libraryStatusMessage}
            />

            {isLibraryMenuOpen ? (
                <button
                    aria-label="Close library menu"
                    className="library-menu-backdrop"
                    onClick={() => setIsLibraryMenuOpen(false)}
                    type="button"
                />
            ) : null}

            <section className="library-content" aria-label="Track library">
                <div className="library-mobile-toolbar">
                    <button
                        aria-controls="library-navigation"
                        aria-expanded={isLibraryMenuOpen}
                        className="library-menu-toggle"
                        onClick={() => setIsLibraryMenuOpen(true)}
                        type="button">
                        <Menu aria-hidden="true" size={19} strokeWidth={2.2} />
                        <span>Library</span>
                    </button>
                </div>
                <TrackTable
                    activeTrackPath={currentTrack?.audioPath}
                    emptyMessage={
                        activeView === 'favorites'
                            ? 'No favorite tracks yet. Mark tracks as favorite in library.json to find them here.'
                            : libraryStatus === 'empty'
                              ? 'Add MP3 or WAV files to a music folder, then rebuild the library.'
                              : selectedFolderHasChildren
                                ? 'This folder has no direct tracks. Choose a nested folder.'
                                : 'Choose a folder with tracks to begin.'
                    }
                    error={libraryStatus === 'error' ? libraryError : null}
                    folderName={
                        activeView === 'favorites'
                            ? 'Favorites'
                            : selectedFolder
                              ? getFolderPathLabel(library, selectedFolder.id)
                              : libraryStatus === 'error'
                                ? 'Library unavailable'
                                : 'Library'
                    }
                    getWaveformUrl={(track) =>
                        resolveWaveformUrl(track, config)
                    }
                    isLoading={isLibraryLoading}
                    isPlaying={isPlaying}
                    copiedShareId={copiedShareId}
                    onCopyShareLink={(track) => {
                        if (track.shareId) {
                            copyShareLink(track.shareId);
                        }
                    }}
                    onSelectTrack={(track) => {
                        const sourceFolderId =
                            activeView === 'favorites'
                                ? favoriteTracks.find(
                                      (favorite) =>
                                          favorite.audioPath ===
                                          track.audioPath,
                                  )?.folderId
                                : selectedFolder?.id;
                        if (sourceFolderId) {
                            selectTrack(sourceFolderId, track);
                        }
                    }}
                    showFolder={activeView === 'favorites'}
                    tracks={displayedTracks}
                />
            </section>

            <PlayerBar
                audioRef={audioRef}
                currentTime={currentTime}
                disableNext={!hasNextTrack}
                duration={duration}
                isPlaying={isPlaying}
                muted={muted}
                onNext={() => {
                    requestNext();
                }}
                onPrevious={() => {
                    requestPrevious();
                }}
                onSeek={requestSeek}
                onSetVolume={setVolume}
                onToggleMute={toggleMuted}
                onTogglePlay={togglePlayPause}
                onToggleShuffle={toggleShuffle}
                shuffleEnabled={shuffleEnabled}
                track={currentTrack}
                volume={volume}
                waveformUrl={
                    currentTrack
                        ? resolveWaveformUrl(currentTrack, config)
                        : undefined
                }
            />

            <audio
                aria-hidden="true"
                hidden
                preload="metadata"
                ref={audioRef}
                tabIndex={-1}
            />
        </main>
    );
}
