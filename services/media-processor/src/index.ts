import type { Clock, EventBusPort, StoragePort } from "@scenelock/ports";
import type { MediaArtifacts, Shot } from "@scenelock/schema";

/**
 * media-processor (spec E.1): shots.raw → keyframes + 16k mono audio + C2PA read
 * → shots.processed. The heavy lifting (FFmpeg, chromaprint, c2pa-python) is a
 * Python service in production (D3); `MediaBackend` is the seam.
 */
export interface MediaBackend {
  /** Extract keyframes, audio, ASR transcript, and read the C2PA manifest for a shot. */
  process(shot: Shot, dialogue: { script: string; audio_cue: string } | null): Promise<MediaArtifacts>;
}

export interface MediaProcessorDeps {
  storage: StoragePort;
  clock: Clock;
  events?: EventBusPort;
  backend: MediaBackend;
}

/**
 * DRY_RUN backend — derives plausible artifacts from the seeded shot instead of
 * decoding real media. The C2PA read reproduces the payload-swap surface (E.5.2):
 * a valid manifest's `generator` equals the shot's veo_job_id; shot_6 has none.
 */
export class DryRunMediaBackend implements MediaBackend {
  constructor(private now: () => string = () => new Date().toISOString()) {}

  async process(
    shot: Shot,
    dialogue: { script: string; audio_cue: string } | null,
  ): Promise<MediaArtifacts> {
    const present = shot.c2pa?.present ?? false;
    const valid = shot.c2pa?.valid ?? false;
    const audioDur =
      shot.gate_runs.find((r) => r.sub_gate === "audio")?.duration_ms ?? 2_000;

    return {
      shot_id: shot.shot_id,
      keyframes: {
        prefix: shot.uris.keyframes_prefix,
        count: Math.max(1, Math.round(shot.frame_count)),
        fps: 1,
      },
      audio: {
        uri: shot.uris.audio,
        sample_rate_hz: 16_000,
        channels: 1,
        duration_ms: audioDur,
      },
      transcript: dialogue?.audio_cue ?? "",
      c2pa: {
        present,
        valid,
        generator: present && valid ? (shot.veo_job_id ?? null) : null,
        signer_chain_ok: present && valid,
        manifest_uri: shot.c2pa?.manifest_uri ?? null,
      },
      content_hash: shot.content_hash ?? `sha256:mp-${shot.shot_id}`,
      processed_at: this.now(),
    };
  }
}

export class MediaProcessor {
  constructor(private deps: MediaProcessorDeps) {}

  /** Handle one `shots.raw` message. Persists artifacts + emits `shots.processed`. */
  async process(shotId: string): Promise<MediaArtifacts> {
    const shot = await this.deps.storage.getShot(shotId);
    if (!shot) throw new Error(`media-processor: unknown shot ${shotId}`);

    const dialogue = await this.deps.storage.getDialogue(shotId);
    const artifacts = await this.deps.backend.process(shot, dialogue);

    await this.deps.storage.putMediaArtifacts(artifacts);
    await this.deps.events?.publish("shots.processed", artifacts, { ordering_key: shotId });
    return artifacts;
  }

  /** Subscribe to the event backbone (E.2). Returns an unsubscribe fn. */
  subscribe(): () => void {
    if (!this.deps.events) return () => {};
    return this.deps.events.subscribe("shots.raw", async (e) => {
      const shotId = (e.payload as { shot_id: string }).shot_id;
      await this.process(shotId);
    });
  }
}
