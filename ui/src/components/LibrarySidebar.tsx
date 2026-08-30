import { Folder, FolderOpen, Star } from 'lucide-react';

import { isFolderInSelectedBranch, type LibraryFolderNode } from '../library';

export interface LibrarySidebarProps {
    folders: readonly LibraryFolderNode[];
    activeFolderId?: string | null;
    onSelectFolder: (folderId: string) => void;
    appName?: string;
    isLoading?: boolean;
    favoriteCount?: number;
    isFavoritesActive?: boolean;
    onSelectFavorites?: () => void;
    status?: string | null;
    className?: string;
    id?: string;
}

/** The library navigation rail. It has no dependency on playback state. */
export function LibrarySidebar({
    activeFolderId,
    appName = 'huebloom',
    className,
    folders,
    favoriteCount = 0,
    isFavoritesActive = false,
    isLoading = false,
    id,
    onSelectFolder,
    onSelectFavorites,
    status,
}: LibrarySidebarProps) {
    function renderFolders(nodes: readonly LibraryFolderNode[]) {
        return [...nodes].reverse().map((node) => {
            const { folder } = node;
            const isActive = folder.id === activeFolderId;
            const isBranchOpen = isFolderInSelectedBranch(
                folder.id,
                activeFolderId ?? null,
            );
            const hasChildren = node.children.length > 0;
            const trackCount = node.totalTrackCount;

            return (
                <li key={folder.id}>
                    <button
                        aria-current={isActive ? 'page' : undefined}
                        aria-expanded={hasChildren ? isBranchOpen : undefined}
                        aria-label={`${folder.name}, ${trackCount} ${trackCount === 1 ? 'track' : 'tracks'}`}
                        className={`folder-navigation__item${isActive ? ' is-active' : ''}${isBranchOpen ? ' is-branch-open' : ''}`}
                        onClick={() => onSelectFolder(folder.id)}
                        type="button">
                        {isBranchOpen ? (
                            <FolderOpen
                                aria-hidden="true"
                                size={23}
                                strokeWidth={1.7}
                            />
                        ) : (
                            <Folder
                                aria-hidden="true"
                                size={23}
                                strokeWidth={1.7}
                            />
                        )}
                        <span className="folder-navigation__name">
                            {folder.name}
                        </span>
                        <span
                            aria-hidden="true"
                            className="folder-navigation__count">
                            {trackCount}
                        </span>
                    </button>

                    {hasChildren && isBranchOpen ? (
                        <ul className="folder-navigation__list folder-navigation__list--nested">
                            {renderFolders(node.children)}
                        </ul>
                    ) : null}
                </li>
            );
        });
    }

    return (
        <aside
            className={['library-sidebar', className].filter(Boolean).join(' ')}
            id={id}
            aria-label={`${appName} library`}>
            <div className="library-sidebar__brand" aria-label={appName}>
                {appName}
            </div>

            <div className="library-sidebar__section">
                <p className="library-sidebar__eyebrow">Library</p>
                <nav aria-label="Library folders" className="folder-navigation">
                    {isLoading ? (
                        <p className="folder-navigation__message">
                            Loading folders…
                        </p>
                    ) : (
                        <ul className="folder-navigation__list">
                            {onSelectFavorites ? (
                                <li>
                                    <button
                                        aria-current={
                                            isFavoritesActive
                                                ? 'page'
                                                : undefined
                                        }
                                        aria-label={`Favorites, ${favoriteCount} ${favoriteCount === 1 ? 'track' : 'tracks'}`}
                                        className={`folder-navigation__item folder-navigation__item--favorites${isFavoritesActive ? ' is-active' : ''}`}
                                        onClick={onSelectFavorites}
                                        type="button">
                                        <Star
                                            aria-hidden="true"
                                            fill={
                                                isFavoritesActive
                                                    ? 'currentColor'
                                                    : 'none'
                                            }
                                            size={21}
                                            strokeWidth={1.8}
                                        />
                                        <span className="folder-navigation__name">
                                            Favorites
                                        </span>
                                        <span
                                            aria-hidden="true"
                                            className="folder-navigation__count">
                                            {favoriteCount}
                                        </span>
                                    </button>
                                </li>
                            ) : null}
                            {folders.length === 0 ? (
                                <li className="folder-navigation__message">
                                    No folders found.
                                </li>
                            ) : null}
                            {renderFolders(folders)}
                        </ul>
                    )}
                </nav>
            </div>

            {status ? (
                <p
                    aria-live="polite"
                    className="library-sidebar__status"
                    role="status">
                    {status}
                </p>
            ) : null}
        </aside>
    );
}
