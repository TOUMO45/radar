import { beforeEach, describe, expect, it } from "vitest";
import { FixedClock, InMemoryEventBus, InMemoryStorage, SeqIdGen } from "@scenelock/ports";
import { CertificatePayload, VerifyResult } from "@scenelock/schema";
import { Certifier } from "./index.js";

const clock = new FixedClock("2026-08-29T18:00:00.000Z");
let storage: InMemoryStorage;
let events: InMemoryEventBus;
let certifier: Certifier;

/** force the scene to a lockable state */
async function lockScene() {
  for (const s of await storage.listShots("sc_12")) {
    await storage.putShot({
      ...s,
      status: "gates_complete",
      c2pa: { present: true, valid: true, manifest_uri: `gs://radar-dev-org-org_demo/shots/${s.shot_id}/c2pa/manifest.json` },
      gate_runs: [
        { gate: "continuity", sub_gate: null, shot_id: s.shot_id, status: "completed", started_at: null, completed_at: null, duration_ms: 1, model_versions: [], error: null },
        { gate: "clearance", sub_gate: null, shot_id: s.shot_id, status: "completed", started_at: null, completed_at: null, duration_ms: 1, model_versions: [], error: null },
        { gate: "clearance", sub_gate: "audio", shot_id: s.shot_id, status: "completed", started_at: null, completed_at: null, duration_ms: 1, model_versions: [], error: null },
      ],
    });
  }
  for (const f of await storage.listFindings("p_dry", { scene: "sc_12" })) {
    await storage.putFinding({ ...f, status: f.stage === "preflight" ? f.status : "waived" });
  }
}

beforeEach(async () => {
  storage = new InMemoryStorage();
  await storage.reset();
  events = new InMemoryEventBus(() => clock.now());
  certifier = new Certifier({ storage, clock, ids: new SeqIdGen(), events });
});

describe("Certifier (spec §8, Appendix D)", () => {
  it("refuses to sign a HELD scene", async () => {
    await expect(certifier.certify("sc_12")).rejects.toThrow(/not LOCKED/);
  });

  it("signs a LOCKED scene → schema-valid payload, verbatim disclaimer, slug", async () => {
    await lockScene();
    const cert = await certifier.certify("sc_12");
    expect(CertificatePayload.safeParse(cert.payload).success).toBe(true);
    expect(cert.payload.disclaimer).toBe("Attests what was checked and what humans decided. Not a legal opinion.");
    expect(cert.payload.verification_slug).toMatch(/^sc12-[0-9a-f]{4}$/);
    expect(cert.payload.certificate_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(cert.payload.prior_certificate_hash).toBeNull();
    expect(cert.payload.findings.some((l) => l.includes("waived"))).toBe(true);
    expect(cert.scene_id).toBe("sc_12");
  });

  it("marks the scene certified and emits certificate.signed", async () => {
    await lockScene();
    const seen: string[] = [];
    events.onSse((e) => seen.push(e.type));
    await certifier.certify("sc_12");
    expect((await storage.getScene("sc_12"))!.status).toBe("certified");
    expect(seen).toContain("certificate.signed");
  });

  it("verify(slug) confirms hash + signature; a tampered payload fails", async () => {
    await lockScene();
    const cert = await certifier.certify("sc_12");
    const v = await certifier.verify(cert.slug);
    expect(VerifyResult.safeParse(v).success).toBe(true);
    expect(v).toMatchObject({ status: "valid", chain_ok: true, signature_ok: true, scene: "sc_12" });

    await storage.putCertificate({
      ...cert,
      payload: { ...cert.payload, findings: [...cert.payload.findings, "f_injected — smuggled in"] },
    });
    const v2 = await certifier.verify(cert.slug);
    expect(v2.chain_ok).toBe(false);
    expect(v2.signature_ok).toBe(false);
  });

  it("verify(unknown slug) → status unknown", async () => {
    const v = await certifier.verify("nope-0000");
    expect(v.status).toBe("unknown");
    expect(v.chain_ok).toBe(false);
  });

  it("chains a second certificate to the first via prior_certificate_hash", async () => {
    await lockScene();
    const c1 = await certifier.certify("sc_12");
    const c2 = await certifier.certify("sc_12");
    expect(c2.payload.prior_certificate_hash).toBe(c1.payload.certificate_hash);
    expect((await certifier.verify(c2.slug)).chain_ok).toBe(true);
  });
});
