"use client";

import { useEffect, useState } from "react";
import { ROLES, getRole, setRole, type ConsoleRole } from "@/lib/client";

/** RBAC is backend-enforced (B.1). This just picks which role the BFF asserts — a demo stand-in for Identity Platform. */
export function RoleSwitcher() {
  const [role, setR] = useState<ConsoleRole>("qa_reviewer");
  useEffect(() => setR(getRole()), []);

  return (
    <label className="mono text-[11px] text-[var(--color-text-secondary)] flex items-center gap-1">
      role
      <select
        value={role}
        onChange={(e) => {
          const r = e.target.value as ConsoleRole;
          setRole(r);
          setR(r);
          location.reload();
        }}
        className="bg-[var(--color-bg-raise)] border rounded-[2px] px-1 py-[2px] text-[var(--color-text-primary)]"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </label>
  );
}
