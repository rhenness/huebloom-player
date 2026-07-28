/**
 * Recognize a final `/share/{id}` path pair while allowing a GitHub Pages
 * project prefix (for example, `/huebloom/share/{id}/`).
 */
export function getShareIdFromPathname(pathname: string): string | null {
  const pathSegments = pathname.split("/").filter(Boolean);
  const shareSegmentIndex = pathSegments.length - 2;

  if (
    shareSegmentIndex < 0 ||
    pathSegments[shareSegmentIndex] !== "share"
  ) {
    return null;
  }

  try {
    const shareId = decodeURIComponent(pathSegments[shareSegmentIndex + 1]);
    return shareId.length > 0 ? shareId : null;
  } catch {
    return null;
  }
}

/** Build an absolute share URL from the document's deployed site root. */
export function getShareUrl(
  shareId: string,
  baseHref = typeof document === "undefined" ? "http://localhost/" : document.baseURI,
): string {
  return new URL(`share/${encodeURIComponent(shareId)}/`, baseHref).href;
}
