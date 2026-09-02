import {
  InMemoryEventBus,
  InMemoryStorage,
  RandomIdGen,
  SystemClock,
  type Clock,
  type EventBusPort,
  type IdGen,
  type LikenessMarketplacePort,
  type ProvenancePort,
  type StoragePort,
} from "@scenelock/ports";
import { DryRunProvenanceAdapter } from "@scenelock/provenance";
import { mockLikenessMarketplace } from "@scenelock/marketplace";
import { Archivist } from "@scenelock/archivist";
import { DryRunMediaBackend, MediaProcessor } from "@scenelock/media-processor";
import { GateClearance } from "@scenelock/gate-clearance";
import { GateContinuity } from "@scenelock/gate-continuity";
import { IncidentWatchdog } from "@scenelock/incidents";
import { RemediationLoop } from "@scenelock/fixer";
import { Certifier } from "@scenelock/certifier";
import { Saboteur } from "@scenelock/saboteur";

/**
 * Wired context. Today every port is in-memory; swapping to Firestore / Pub-Sub
 * later means constructing this with the cloud adapters — no route changes.
 */
export interface AppContext {
  storage: StoragePort;
  events: EventBusPort;
  clock: Clock;
  ids: IdGen;
  archivist: Archivist;
  mediaProcessor: MediaProcessor;
  gateClearance: GateClearance;
  gateContinuity: GateContinuity;
  incidents: IncidentWatchdog;
  loop: RemediationLoop;
  certifier: Certifier;
  saboteur: Saboteur;
  provenance: ProvenancePort;
  marketplace: LikenessMarketplacePort;
}

export function buildContext(overrides: Partial<AppContext> = {}): AppContext {
  const clock = overrides.clock ?? new SystemClock();
  const storage = overrides.storage ?? new InMemoryStorage();
  const events = overrides.events ?? new InMemoryEventBus(() => clock.now());
  const ids = overrides.ids ?? new RandomIdGen();
  const archivist =
    overrides.archivist ?? new Archivist({ storage, clock, ids, events });
  const mediaProcessor =
    overrides.mediaProcessor ??
    new MediaProcessor({
      storage,
      clock,
      events,
      backend: new DryRunMediaBackend(() => clock.now()),
    });
  const gateClearance =
    overrides.gateClearance ?? new GateClearance({ storage, clock, events });
  const gateContinuity =
    overrides.gateContinuity ?? new GateContinuity({ storage, clock, archivist, events });
  const incidents =
    overrides.incidents ?? new IncidentWatchdog({ storage, clock, ids, events });
  const loop =
    overrides.loop ??
    new RemediationLoop({
      storage,
      clock,
      ids,
      events,
      archivist,
      mediaProcessor,
      gateClearance,
      gateContinuity,
      incidents,
    });
  const certifier = overrides.certifier ?? new Certifier({ storage, clock, ids, events });
  const saboteur = overrides.saboteur ?? new Saboteur({ clock });
  const provenance =
    overrides.provenance ?? new DryRunProvenanceAdapter(() => clock.now());
  const marketplace = overrides.marketplace ?? mockLikenessMarketplace;
  return {
    storage,
    events,
    clock,
    ids,
    archivist,
    mediaProcessor,
    gateClearance,
    gateContinuity,
    incidents,
    loop,
    certifier,
    saboteur,
    provenance,
    marketplace,
  };
}
