/** C-17 HashChainView — this cert's hash + prev_hash chain with visual links. */
export function HashChainView({
  chain,
  currentHash,
}: {
  chain: Array<{ id: string; hash: string; prev: string | null; scene: string }>;
  currentHash: string;
}) {
  if (chain.length === 0)
    return <div className="text-[11px] text-[var(--color-text-secondary)]">genesis — no prior certificate</div>;

  return (
    <div className="flex flex-col gap-1">
      {chain.map((c, i) => (
        <div key={c.id} className="flex items-center gap-2">
          {i > 0 && (
            <span className="mono text-[10px] text-[var(--color-text-secondary)] pl-3">↑ prev_hash</span>
          )}
          <div
            className="mono text-[11px] px-2 py-1 rounded-[2px] border flex-1"
            style={{
              borderColor: c.hash === currentHash ? "var(--color-status-certified)" : "var(--color-line-hair)",
              color: c.hash === currentHash ? "var(--color-status-certified)" : "var(--color-text-secondary)",
            }}
          >
            <span className="text-[var(--color-text-primary)]">{c.scene}</span> · sha256:{c.hash.slice(0, 16)}…
            {c.hash === currentHash && <span className="ml-2">← this certificate</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
