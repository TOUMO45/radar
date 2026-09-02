import Link from "next/link";

export default function NotFound() {
  return (
    <div className="panel p-6 m-4">
      <div className="mono text-[13px] text-[var(--color-text-secondary)]">
        Radar quiet — nothing here.
      </div>
      <Link href="/" className="mono text-[12px] text-[var(--color-source-deterministic)] underline mt-2 inline-block">
        ← back to productions
      </Link>
    </div>
  );
}
