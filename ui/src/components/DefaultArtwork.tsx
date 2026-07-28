export interface DefaultArtworkProps {
  size?: number;
  className?: string;
}

/** A small, CSS-friendly 16-bit music tile used when no cover art is available. */
export function DefaultArtwork({ className, size = 32 }: DefaultArtworkProps) {
  return (
    <svg
      aria-hidden="true"
      className={["default-artwork", className].filter(Boolean).join(" ")}
      height={size}
      shapeRendering="crispEdges"
      viewBox="0 0 64 64"
      width={size}
    >
      <path d="M4 4h56v56H4z" fill="#3d4143" />
      <path d="M8 8h48v48H8z" fill="#e8e9e5" />
      <path d="M16 16h12v4H16zM16 20h4v4h-4zM40 16h8v4h-8z" fill="#b8bcbb" />
      <path d="M16 52h32v-4H16z" fill="#b8bcbb" />

      <path d="M26 20h22v6H26zM26 24h6v18h-6zM42 20h6v18h-6z" fill="#1e427e" />
      <path d="M24 18h22v6H24zM24 22h6v18h-6zM40 18h6v18h-6z" fill="#29549c" />
      <path d="M18 38h12v4h4v8h-4v4H18v-4h-4v-8h4z" fill="#29549c" />
      <path d="M34 34h12v4h4v8h-4v4H34v-4h-4v-8h4z" fill="#29549c" />
      <path d="M18 38h8v4h-8zM34 34h8v4h-8z" fill="#5b86c7" />
    </svg>
  );
}
