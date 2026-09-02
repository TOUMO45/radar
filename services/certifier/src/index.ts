import { createHash, createHmac } from "node:crypto";
import type { Clock, EventBusPort, IdGen, StoragePort } from "@scenelock/ports";
import {
  DISCLAIMER,
  type Certificate,
  type CertificatePayload,
  type VerifyResult,
} from "@scenelock/schema";
import { computeVerdict } from "@scenelock/verdict";
import { generateCueSheet } from "@scenelock/gate-music";

/**
 * Certifier — a deterministic Cloud Run service, never an agent (D2). Compiles
 * the certificate (Appendix D), chains it by sha-256 to the production's prior
 * certificate, and signs the canonical bytes with KMS (mock HMAC in DRY_RUN;
 * Cloud KMS asymmetric key + rotation in prod, G-15).
 */
export interface SignerBackend {
  sign(bytes: string): { signature: string; key_version: string };
  verify(bytes: string, signature: string): boolean;
}

/** Dev signer — HMAC-SHA256 with a fixed key. Swap for Cloud KMS asymmetric signing. */
export class MockKmsSigner implements SignerBackend {
  constructor(
    private key = "scenelock-dev-cert-chain-signer",
    public keyVersion = "cert-chain-signer/1",
  ) {}
  sign(bytes: string) {
    return {
      signature: createHmac("sha256", this.key).update(bytes).digest("hex"),
      key_version: this.keyVersion,
    };
  }
  verify(bytes: string, signature: string) {
    return this.sign(bytes).signature === signature;
  }
}

export interface CertifierDeps {
  storage: StoragePort;
  clock: Clock;
  ids: IdGen;
  events?: EventBusPort;
  signer?: SignerBackend;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Everything the certificate attests, minus the derived hash / key / slug fields. */
type CertBase = Omit<
  CertificatePayload,
  "certificate_hash" | "kms_key_version" | "verification_slug"
>;

/** Canonical bytes for hashing/signing — stable key order. */
function canonicalBytes(p: CertBase): string {
  return JSON.stringify(p, Object.keys(p).sort());
}

export class Certifier {
  private signer: SignerBackend;
  constructor(private d: CertifierDeps) {
    this.signer = d.signer ?? new MockKmsSigner();
  }

  async certify(sceneId: string): Promise<Certificate> {
    const scene = await this.d.storage.getScene(sceneId);
    if (!scene) throw new Error(`certifier: unknown scene ${sceneId}`);
    const production = await this.d.storage.getProduction(scene.production_id);
    if (!production) throw new Error(`certifier: unknown production for ${sceneId}`);

    const [shots, findings, entities, musicCues] = await Promise.all([
      this.d.storage.listShots(sceneId),
      this.d.storage.listFindings(production.production_id, { scene: sceneId }),
      this.d.storage.listEntities(production.production_id),
      this.d.storage.listMusicCues(sceneId),
    ]);

    const verdict = computeVerdict({
      scene_id: sceneId,
      tau: production.settings.tau,
      config_version: production.settings.config_version,
      kill_switch: production.kill_switch,
      shots,
      findings,
      now: () => this.d.clock.now(),
    });
    if (verdict.verdict !== "LOCKED")
      throw new Error(`certifier: scene ${sceneId} is ${verdict.verdict}, not LOCKED`);

    const chain = await this.d.storage.listCertificates(production.production_id);
    const prior = chain.at(-1) ?? null;

    const findingLines = findings.map((f) => {
      if (f.status === "waived")
        return `${f.finding_id} (${f.risk_class}) — waived${f.adjudication ? `: "${f.adjudication.reason}"` : ""}`;
      if (f.status === "resolved")
        return `${f.finding_id} (${f.risk_class}) — resolved${f.remediation?.directive_id ? ` via ${f.remediation.directive_id}` : ""}`;
      return `${f.finding_id} (${f.risk_class}) — ${f.status} (non-blocking)`;
    });

    const now = this.d.clock.now();
    const base: CertBase = {
      project: production.production_id,
      scene: sceneId,
      lock_timestamp: now,
      final_world_state: `snapshot-ref:gs://radar-dev-org-${production.org_id}/snapshots/${sceneId}.json`,
      findings: findingLines,
      evidence_chain: {
        frames: findings.map((f) => f.evidence_uri).filter((u): u is string => !!u),
        quotes: findings.map((f) => f.evidence_quote).filter((q): q is string => !!q),
        embedding_versions: Array.from(
          new Set(entities.map((e) => e.embedding_model_version).filter((v): v is string => !!v)),
        ),
      },
      c2pa_manifests: shots
        .map((s) => s.c2pa?.manifest_uri)
        .filter((u): u is string => !!u),
      music_appendix: musicCues.length ? generateCueSheet(musicCues, production.title, now) : null,
      disclaimer: DISCLAIMER,
      schema_version: "2.1" as const,
      prior_certificate_hash: prior?.payload.certificate_hash ?? null,
    };

    const certificate_hash = sha256(canonicalBytes(base));
    const slug = `${sceneId.replace(/[^a-z0-9]/gi, "")}-${certificate_hash.slice(0, 4)}`;
    const { signature, key_version } = this.signer.sign(canonicalBytes(base));

    const payload: CertificatePayload = {
      ...base,
      certificate_hash,
      kms_key_version: key_version,
      verification_slug: slug,
    };

    const cert: Certificate = {
      certificate_id: this.d.ids.next("cert"),
      production_id: production.production_id,
      scene_id: sceneId,
      slug,
      payload,
      signature,
      created_at: now,
      revoked: false,
    };
    await this.d.storage.putCertificate(cert);
    await this.d.storage.putScene({ ...scene, status: "certified" });
    await this.d.events?.publish("certificates.events", { type: "signed", cert }, { ordering_key: sceneId });
    this.d.events?.emitSse({ type: "certificate.signed", data: { certificateId: cert.certificate_id, hash: certificate_hash } });
    return cert;
  }

  getCertificate(id: string) {
    return this.d.storage.getCertificate(id);
  }
  listCertificates(pid: string) {
    return this.d.storage.listCertificates(pid);
  }
  async getSceneCertificate(sceneId: string): Promise<Certificate | null> {
    const scene = await this.d.storage.getScene(sceneId);
    if (!scene) return null;
    const chain = await this.d.storage.listCertificates(scene.production_id);
    return chain.filter((c) => c.scene_id === sceneId).at(-1) ?? null;
  }

  /** Public verification (G-16) — recompute the hash, check the chain, verify the signature. */
  async verify(slug: string): Promise<VerifyResult> {
    const cert = await this.d.storage.getCertificateBySlug(slug);
    if (!cert) {
      return {
        slug,
        status: "unknown",
        scene: "",
        project: "",
        lock_timestamp: null,
        certificate_hash: null,
        prior_certificate_hash: null,
        chain_ok: false,
        signature_ok: false,
        disclaimer: DISCLAIMER,
      };
    }
    const { certificate_hash, kms_key_version, verification_slug, ...base } = cert.payload;
    void kms_key_version;
    void verification_slug;
    const recomputed = sha256(canonicalBytes(base));
    const hashOk = recomputed === certificate_hash;
    const sigOk = this.signer.verify(canonicalBytes(base), cert.signature);

    let chainOk = hashOk;
    if (cert.payload.prior_certificate_hash) {
      const chain = await this.d.storage.listCertificates(cert.production_id);
      chainOk =
        chainOk &&
        chain.some((c) => c.payload.certificate_hash === cert.payload.prior_certificate_hash);
    }

    return {
      slug,
      status: cert.revoked ? "revoked" : "valid",
      scene: cert.scene_id,
      project: cert.production_id,
      lock_timestamp: cert.payload.lock_timestamp,
      certificate_hash,
      prior_certificate_hash: cert.payload.prior_certificate_hash,
      chain_ok: chainOk,
      signature_ok: sigOk,
      disclaimer: DISCLAIMER,
    };
  }
}
