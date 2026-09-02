/** C-22 EmptyRadar — never a bare "no data": counts + last-sweep time. */
export function EmptyRadar({
  openFindings = 0,
  lastSweep,
  label = "Radar quiet",
}: {
  openFindings?: number;
  lastSweep?: string;
  label?: string;
}) {
  const t = lastSweep ? new Date(lastSweep) : new Date();
  const hhmm = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  return (
    <div className="px-4 py-8 text-center">
      <div className="mono text-[13px] text-[var(--color-text-secondary)]">
        {label} — {openFindings} open finding{openFindings === 1 ? "" : "s"}, last sweep {hhmm}
      </div>
    </div>
  );
}
