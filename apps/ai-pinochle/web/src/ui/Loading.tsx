// Plain loading text shown while a lazy-loaded route chunk is being fetched.
// Matches the muted "Loading..." style used elsewhere (e.g. MyGamesPage).
export function Loading({ label = "Loading..." }: { label?: string }) {
  return (
    <p
      style={{
        color: "#888",
        fontSize: "0.875rem",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      {label}
    </p>
  );
}
