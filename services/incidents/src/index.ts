import type { Clock, EventBusPort, IdGen, StoragePort } from "@scenelock/ports";
import { computeBlocking, type Finding, type Incident } from "@scenelock/schema";

/**
 * IncidentWatchdog — the Grafana-alert-to-incident behaviour (spec C.3 Flow B,
 * E.11), local edition. A blocking, unresolved finding opens exactly one
 * incident, auto-assigned to the Fixer; resolving/waiving the finding auto-closes
 * it with a resolution note. In production this is a Grafana alert rule on the
 * precomputed `blocking` label → Grafana Incidents; here it's `IncidentsPort`.
 */
export interface IncidentWatchdogDeps {
  storage: StoragePort;
  clock: Clock;
  ids: IdGen;
  events?: EventBusPort;
  /** grace period before a persistent blocking finding opens an incident (E.11: 5 min). 0 in DRY_RUN. */
  graceMs?: number;
  assignee?: string;
}

const UNRESOLVED = new Set(["open", "in_remediation", "escalated"]);

export class IncidentWatchdog {
  constructor(private deps: IncidentWatchdogDeps) {}

  /** Reconcile incidents for a whole production against current findings. */
  async sweep(productionId: string, tau: number): Promise<{ opened: string[]; closed: string[] }> {
    const findings = await this.deps.storage.listFindings(productionId, {});
    const incidents = await this.deps.storage.listIncidents(productionId);
    const byFinding = new Map(incidents.map((i) => [i.finding_id, i]));
    const findingById = new Map(findings.map((f) => [f.finding_id, f]));

    const opened: string[] = [];
    const closed: string[] = [];

    for (const f of findings) {
      const blocking = computeBlocking(f, tau) && UNRESOLVED.has(f.status);
      const existing = byFinding.get(f.finding_id);
      if (blocking && (!existing || existing.status === "closed")) {
        opened.push(await this.open(f));
      } else if (!blocking && existing && existing.status === "open") {
        closed.push(await this.close(existing, resolutionNote(f)));
      }
    }

    // close incidents whose finding was reconciled away entirely (P4 loop deletes
    // superseded gate findings) — a vanished finding is a resolved one.
    for (const inc of incidents) {
      if (inc.status === "open" && !findingById.has(inc.finding_id)) {
        closed.push(await this.close(inc, "auto-closed: finding cleared by regeneration"));
      }
    }
    return { opened, closed };
  }

  /** React to a single finding change (e.g. from findings.events). */
  async onFinding(f: Finding, tau: number): Promise<Incident | null> {
    const incidents = await this.deps.storage.listIncidents(
      (await this.deps.storage.getScene(f.scene_id))?.production_id ?? "",
    );
    const existing = incidents.find((i) => i.finding_id === f.finding_id);
    const blocking = computeBlocking(f, tau) && UNRESOLVED.has(f.status);

    if (blocking && (!existing || existing.status === "closed")) {
      const id = await this.open(f);
      return this.deps.storage.getIncident(id);
    }
    if (!blocking && existing && existing.status === "open") {
      await this.close(existing, resolutionNote(f));
      return this.deps.storage.getIncident(existing.incident_id);
    }
    return existing ?? null;
  }

  subscribe(tau: number): () => void {
    if (!this.deps.events) return () => {};
    return this.deps.events.subscribe("findings.events", async (e) => {
      const f = e.payload as Finding;
      if (f?.finding_id) await this.onFinding(f, tau);
    });
  }

  private async open(f: Finding): Promise<string> {
    const scene = await this.deps.storage.getScene(f.scene_id);
    const incident: Incident = {
      incident_id: this.deps.ids.next("inc"),
      production_id: scene?.production_id ?? "",
      scene_id: f.scene_id,
      finding_id: f.finding_id,
      status: "open",
      reason: `blocking finding ${f.finding_id} (${f.risk_class})`,
      assignee: this.deps.assignee ?? "fixer",
      severity: f.severity,
      opened_at: this.deps.clock.now(),
      closed_at: null,
      note: null,
    };
    await this.deps.storage.putIncident(incident);
    await this.deps.events?.publish("incidents.events", { type: "opened", incident });
    this.deps.events?.emitSse({
      type: "incident.opened",
      data: { incidentId: incident.incident_id, findingId: f.finding_id },
    });
    return incident.incident_id;
  }

  private async close(incident: Incident, note: string): Promise<string> {
    const closed: Incident = {
      ...incident,
      status: "closed",
      closed_at: this.deps.clock.now(),
      note,
    };
    await this.deps.storage.putIncident(closed);
    await this.deps.events?.publish("incidents.events", { type: "closed", incident: closed });
    this.deps.events?.emitSse({
      type: "incident.closed",
      data: { incidentId: incident.incident_id, findingId: incident.finding_id, note },
    });
    return incident.incident_id;
  }
}

function resolutionNote(f: Finding): string {
  if (f.status === "waived")
    return `auto-closed: finding waived${f.adjudication ? ` by ${f.adjudication.by} — "${f.adjudication.reason}"` : ""}`;
  if (f.status === "resolved")
    return `auto-closed: finding resolved${f.remediation?.directive_id ? ` via ${f.remediation.directive_id}` : ""}`;
  return "auto-closed: finding no longer blocking";
}
