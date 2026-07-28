import type { RuntimeConfig, Track } from "./types";

declare const __HUEBLOOM_LIBRARY_PASSWORD__: string | undefined;

declare global {
  interface Window {
    HUEBLOOM_CONFIG?: Partial<RuntimeConfig>;
  }
}

/**
 * These defaults make a Vite development server work with the development
 * proxy.  Production replaces them through the generated config.js file.
 */
function buildTimeLibraryPassword(): string {
  return typeof __HUEBLOOM_LIBRARY_PASSWORD__ === "string" &&
    __HUEBLOOM_LIBRARY_PASSWORD__.trim().length > 0
    ? __HUEBLOOM_LIBRARY_PASSWORD__
    : "change-me";
}

export const DEFAULT_RUNTIME_CONFIG: Readonly<RuntimeConfig> = Object.freeze({
  libraryUrl: "/library.json",
  mediaBaseUrl: "/",
  libraryPassword: buildTimeLibraryPassword(),
});

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Read and normalize the optional configuration injected before the bundle. */
export function getRuntimeConfig(
  injectedConfig: Partial<RuntimeConfig> | undefined =
    typeof window === "undefined" ? undefined : window.HUEBLOOM_CONFIG,
): RuntimeConfig {
  return {
    libraryUrl: nonEmptyString(injectedConfig?.libraryUrl)
      ? injectedConfig.libraryUrl
      : DEFAULT_RUNTIME_CONFIG.libraryUrl,
    mediaBaseUrl: nonEmptyString(injectedConfig?.mediaBaseUrl)
      ? injectedConfig.mediaBaseUrl
      : DEFAULT_RUNTIME_CONFIG.mediaBaseUrl,
    libraryPassword: nonEmptyString(injectedConfig?.libraryPassword)
      ? injectedConfig.libraryPassword
      : DEFAULT_RUNTIME_CONFIG.libraryPassword,
  };
}

function currentLocationHref(): string {
  if (typeof document !== "undefined" && document.baseURI) {
    return document.baseURI;
  }

  return typeof window === "undefined" ? "http://localhost/" : window.location.href;
}

/**
 * Resolve an asset without string concatenation so spaces, parentheses, and
 * other valid filename characters are encoded correctly.
 */
export function resolveResourceUrl(
  relativePath: string,
  baseUrl: string,
  locationHref = currentLocationHref(),
): string {
  return new URL(relativePath, new URL(baseUrl, locationHref)).href;
}

export function resolveLibraryUrl(
  config: RuntimeConfig = getRuntimeConfig(),
): string {
  return resolveResourceUrl(config.libraryUrl, currentLocationHref());
}

export function resolveTrackUrl(
  track: Pick<Track, "audioPath">,
  config: RuntimeConfig = getRuntimeConfig(),
): string {
  return resolveResourceUrl(track.audioPath, config.mediaBaseUrl);
}
