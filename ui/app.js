(() => {
  const config = window.HUEBLOOM_CONFIG;

  const elements = {
    audioPlayer: document.querySelector("#audio-player"),
    folderList: document.querySelector("#folder-list"),
    libraryStatus: document.querySelector("#library-status"),
    nowPlaying: document.querySelector("#now-playing-heading"),
    trackCount: document.querySelector("#track-count"),
    trackList: document.querySelector("#track-list"),
  };

  const state = {
    activeFolderId: null,
    activeTrackPath: null,
    library: null,
  };

  function isLibrary(value) {
    return (
      value &&
      typeof value === "object" &&
      Array.isArray(value.folders) &&
      value.folders.every(
        (folder) =>
          folder &&
          typeof folder.id === "string" &&
          typeof folder.name === "string" &&
          Array.isArray(folder.tracks) &&
          folder.tracks.every(
            (track) =>
              track &&
              typeof track.filename === "string" &&
              typeof track.title === "string" &&
              typeof track.audioPath === "string" &&
              typeof track.isFavorite === "boolean",
          ),
      )
    );
  }

  function setStatus(message, isError = false) {
    elements.libraryStatus.textContent = message;
    elements.libraryStatus.classList.toggle("is-error", isError);
  }

  function resolveResourceUrl(relativePath, baseUrl) {
    return new URL(relativePath, new URL(baseUrl, window.location.href)).href;
  }

  function getActiveFolder() {
    return state.library.folders.find(
      (folder) => folder.id === state.activeFolderId,
    );
  }

  function createFolderButton(folder) {
    const button = document.createElement("button");
    const name = document.createElement("span");
    const count = document.createElement("span");
    const isActive = folder.id === state.activeFolderId;

    button.className = "folder-button";
    button.type = "button";
    button.setAttribute("aria-current", String(isActive));
    button.classList.toggle("is-active", isActive);
    button.addEventListener("click", () => {
      state.activeFolderId = folder.id;
      renderLibrary();
    });

    name.className = "folder-name";
    name.textContent = folder.name;
    count.className = "folder-count";
    count.textContent = String(folder.tracks.length);

    button.append(name, count);
    return button;
  }

  async function selectTrack(track) {
    state.activeTrackPath = track.audioPath;
    elements.audioPlayer.pause();
    elements.audioPlayer.src = resolveResourceUrl(track.audioPath, config.mediaBaseUrl);
    elements.audioPlayer.load();
    elements.nowPlaying.textContent = track.title;
    setStatus("");
    renderTracks();

    try {
      await elements.audioPlayer.play();
    } catch (error) {
      setStatus("Playback could not start.", true);
      console.error(error);
    }
  }

  function createTrackButton(track) {
    const button = document.createElement("button");
    const title = document.createElement("span");
    const filename = document.createElement("span");
    const favorite = document.createElement("span");
    const isActive = track.audioPath === state.activeTrackPath;

    button.className = "track-button";
    button.type = "button";
    button.setAttribute("aria-current", String(isActive));
    button.classList.toggle("is-active", isActive);
    button.addEventListener("click", () => selectTrack(track));

    title.className = "track-title";
    title.textContent = track.title;
    filename.className = "track-filename";
    filename.textContent = track.filename;
    favorite.className = "track-favorite";
    favorite.textContent = track.isFavorite ? "Favorite" : "";
    favorite.setAttribute("aria-label", track.isFavorite ? "Favorite" : "");

    button.append(title, filename, favorite);
    return button;
  }

  function renderFolders() {
    elements.folderList.replaceChildren(
      ...state.library.folders.map(createFolderButton),
    );
  }

  function renderTracks() {
    const activeFolder = getActiveFolder();

    if (!activeFolder) {
      elements.trackCount.textContent = "";
      elements.trackList.replaceChildren();
      return;
    }

    elements.trackCount.textContent = `${activeFolder.tracks.length} track${
      activeFolder.tracks.length === 1 ? "" : "s"
    }`;

    if (activeFolder.tracks.length === 0) {
      const emptyState = document.createElement("p");
      emptyState.className = "empty-state";
      emptyState.textContent = "No tracks";
      elements.trackList.replaceChildren(emptyState);
      return;
    }

    elements.trackList.replaceChildren(
      ...activeFolder.tracks.map(createTrackButton),
    );
  }

  function renderLibrary() {
    if (state.library.folders.length === 0) {
      elements.folderList.replaceChildren();
      elements.trackCount.textContent = "";
      elements.trackList.replaceChildren();
      elements.nowPlaying.textContent = "No tracks available";
      return;
    }

    if (!getActiveFolder()) {
      state.activeFolderId = state.library.folders[0].id;
    }

    renderFolders();
    renderTracks();
  }

  async function loadLibrary() {
    if (!config) {
      setStatus("Missing player configuration.", true);
      return;
    }

    setStatus("Loading library...");

    try {
      const response = await fetch(
        resolveResourceUrl(config.libraryUrl, window.location.href),
      );

      if (!response.ok) {
        throw new Error(`Library request failed with ${response.status}.`);
      }

      const library = await response.json();

      if (!isLibrary(library)) {
        throw new Error("Library data does not match the expected format.");
      }

      state.library = library;
      renderLibrary();
      setStatus("");
    } catch (error) {
      state.library = { folders: [] };
      renderLibrary();
      setStatus("Library unavailable.", true);
      console.error(error);
    }
  }

  elements.audioPlayer.addEventListener("error", () => {
    if (elements.audioPlayer.src) {
      setStatus("Audio could not be loaded.", true);
    }
  });

  elements.audioPlayer.addEventListener("play", () => setStatus("Playing"));
  elements.audioPlayer.addEventListener("pause", () => {
    if (elements.audioPlayer.src && !elements.audioPlayer.ended) {
      setStatus("Paused");
    }
  });
  elements.audioPlayer.addEventListener("ended", () => setStatus("Playback ended"));

  loadLibrary();
})();