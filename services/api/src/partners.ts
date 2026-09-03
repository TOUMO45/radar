/**
 * Partner map (Feature 4) — the adjacent players RADAR intentionally
 * orchestrates rather than rebuilds, and exactly how far each integration
 * actually goes today.
 *
 * `status` is one of:
 *   - "live"                     — imported and called in real code that
 *                                  passes a live self-test right now.
 *   - "integration_port_defined" — a typed seam exists in the codebase for a
 *                                  vendor to drop in behind; not yet wired to
 *                                  a live vendor endpoint.
 *
 * Nothing that is not built is described as live.
 */

export interface Partner {
  name: string;
  category: string;
  role: string;
  status: "live" | "integration_port_defined";
  /** the typed seam or call site this claim is backed by. */
  seam: string;
  cite: string;
}

export const PARTNERS: Partner[] = [
  {
    name: "Vermillio",
    category: "likeness rights",
    role: "Licenses living-performer digital replicas; RADAR requests quotes and files the returned consent record against the shot.",
    status: "integration_port_defined",
    seam: "LikenessMarketplacePort",
    cite: "packages/ports/src/marketplace.ts:22 | provider enum packages/schema/src/marketplace.ts | mock adapter services/marketplace/src/index.ts:33",
  },
  {
    name: "Loti",
    category: "likeness rights",
    role: "Likeness protection & licensing for living / synthetic performers; same quote -> clear -> consent-record flow as Vermillio.",
    status: "integration_port_defined",
    seam: "LikenessMarketplacePort",
    cite: "packages/ports/src/marketplace.ts:22 | provider enum packages/schema/src/marketplace.ts | mock adapter services/marketplace/src/index.ts:41",
  },
  {
    name: "Interra Systems BATON",
    category: "technical delivery QC",
    role: "Automated broadcast/IMF/DCP conformance QC (loudness, captions, frame rate, colour, codec) over the assembled master.",
    status: "integration_port_defined",
    seam: "TechnicalQcPort",
    cite: "packages/ports/src/technical-qc.ts | RADAR does this internally today via @scenelock/gate-delivery over StoragePort.getTechnicalMaster (packages/ports/src/storage.ts:107)",
  },
  {
    name: "Audible Magic",
    category: "music content ID",
    role: "Audio fingerprinting to identify musical works actually present in the mix, feeding the cue sheet and the music-rights gate.",
    status: "integration_port_defined",
    seam: "MusicIdPort",
    cite: "packages/ports/src/music-id.ts | RADAR builds the cue sheet today from declared cues via @scenelock/gate-music over StoragePort.listMusicCues (packages/ports/src/storage.ts:110)",
  },
  {
    name: "Grafana Cloud",
    category: "observability",
    role: "Incident, annotation, log and metric backbone. The Fixer agent resolves live Grafana MCP tools; product routes post real annotations over the HTTP API.",
    status: "live",
    seam: "Grafana MCP toolset + HTTP Annotations API",
    cite: "services/agent/radar_agent.py:206-227 (MCP toolset, G5 passes live) | services/api/src/grafana.ts (direct annotations)",
  },
  {
    name: "Google Vertex AI / Gemini",
    category: "LLM",
    role: "The model that explains deterministic findings and answers grounded questions - it never decides a verdict and holds zero mutating tools.",
    status: "live",
    seam: "Vertex AI (ADC) - gemini-2.5-flash",
    cite: "services/agent/radar_agent.py:294 (G6 passes live) | services/api/src/assistant.ts (grounded assistant)",
  },
];
