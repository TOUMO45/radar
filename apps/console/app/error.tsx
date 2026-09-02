"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="panel p-4 m-4" style={{ borderLeft: "3px solid var(--color-status-error)" }}>
      <div className="font-medium text-[var(--color-status-error)]">Something broke on this screen</div>
      <div className="mono text-[11px] text-[var(--color-text-secondary)] mt-1">
        {error.message}
        {error.digest ? ` · ${error.digest}` : ""}
      </div>
      <button
        onClick={reset}
        className="mono text-[12px] px-3 py-1 rounded-[2px] border mt-3"
        style={{ color: "var(--color-source-deterministic)", borderColor: "var(--color-source-deterministic)" }}
      >
        retry
      </button>
    </div>
  );
}
