import {
  computeBlocking,
  DELIVERY_SPECS,
  type ComplianceProfile,
  type DeliveryCheck,
  type DeliverySpec,
  type DeliveryTargetReport,
  type Finding,
  type Platform,
  type TechnicalDeliveryReport,
  type TechnicalMaster,
} from "@scenelock/schema";

/**
 * The Technical Delivery gate (roadmap R4).
 *
 * Deterministic like every other gate (S1): it checks a scene's assembled master
 * against each targeted platform's *technical* delivery spec (loudness, captions,
 * frame rate, resolution, colour space, bit depth, codec) and turns each miss
 * into Finding v2 under a new `delivery` gate. It adds no *required* gate, so the
 * lock-coverage math is unchanged — but because these are ordinary findings they
 * flow through `blocking` / verdict / loop for free (D5). Surfaced via endpoint,
 * not injected into the seed findings[] (same contract as the compliance gate).
 */

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol + 1e-9;
const fpsMatch = (fps: number, allowed: number[]) => allowed.some((a) => near(fps, a, 0.02));

/** Compare an observed master to one platform spec. Pure. */
export function checkMaster(master: TechnicalMaster, spec: DeliverySpec): DeliveryCheck[] {
  const checks: DeliveryCheck[] = [];
  const push = (param: string, required: string, observed: string, ok: boolean, severity: DeliveryCheck["severity"]) =>
    checks.push({ param, required, observed, ok, severity });

  push(
    "resolution",
    `>= ${spec.min_width}x${spec.min_height}`,
    `${master.width}x${master.height}`,
    master.width >= spec.min_width && master.height >= spec.min_height,
    "high",
  );
  push(
    "frame_rate",
    spec.allowed_fps.join("/") + " fps",
    `${master.fps} fps`,
    fpsMatch(master.fps, spec.allowed_fps),
    "high",
  );
  push(
    "color_space",
    spec.allowed_color_spaces.join("/"),
    master.color_space,
    spec.allowed_color_spaces.includes(master.color_space),
    "medium",
  );
  push(
    "bit_depth",
    `>= ${spec.min_bit_depth}-bit`,
    `${master.bit_depth}-bit`,
    master.bit_depth >= spec.min_bit_depth,
    "medium",
  );
  push(
    "codec",
    spec.allowed_codecs.join("/"),
    master.codec,
    spec.allowed_codecs.includes(master.codec.toLowerCase()),
    "medium",
  );
  if (master.loudness_lkfs !== null) {
    push(
      "loudness",
      `${spec.loudness_lkfs_target} +/- ${spec.loudness_tolerance} LKFS`,
      `${master.loudness_lkfs} LKFS`,
      near(master.loudness_lkfs, spec.loudness_lkfs_target, spec.loudness_tolerance),
      "high",
    );
  }
  if (master.true_peak_dbtp !== null) {
    push(
      "true_peak",
      `<= ${spec.max_true_peak_dbtp} dBTP`,
      `${master.true_peak_dbtp} dBTP`,
      master.true_peak_dbtp <= spec.max_true_peak_dbtp + 1e-9,
      "medium",
    );
  }
  if (spec.captions_required) {
    push(
      "captions",
      "required",
      master.has_captions ? `present (${master.caption_format ?? "?"})` : "absent",
      master.has_captions,
      "high",
    );
  }
  return checks;
}

function checkToFinding(
  sceneId: string,
  platform: Platform,
  spec: DeliverySpec,
  c: DeliveryCheck,
  tau: number,
  now: string,
): Finding {
  const f: Finding = {
    finding_id: `f_del_${sceneId}_${platform}_${c.param}`,
    scene_id: sceneId,
    shot_id: null,
    frame: null,
    gate: "delivery",
    sub_gate: null,
    stage: "shot",
    risk_class: "technical_delivery",
    rule: `delivery.${platform}.${c.param}`,
    description: `${spec.label}: ${c.param} is ${c.observed}, requires ${c.required} (${spec.citation}).`,
    recommendation: `Re-master to meet ${spec.label} ${c.param}: ${c.required}.`,
    severity: c.severity,
    confidence: 1.0,
    measurement: null,
    evidence_uri: null,
    evidence_quote: null,
    status: "open",
    source: "deterministic",
    entity_id: null,
    state_expected: null,
    state_observed: null,
    remediation: null,
    c2pa: null,
    adjudication: null,
    blocking: false,
    created_at: now,
    schema_version: "2.1",
  };
  f.blocking = computeBlocking(f, tau);
  return f;
}

export interface DeliveryInput {
  scene_id: string;
  master: TechnicalMaster | null;
  profile: ComplianceProfile;
  tau: number;
  now: string;
}

export interface DeliveryRunResult {
  report: TechnicalDeliveryReport;
  findings: Finding[];
}

export class GateDelivery {
  run(input: DeliveryInput): DeliveryRunResult {
    const targets: DeliveryTargetReport[] = [];
    const findings: Finding[] = [];

    if (input.master) {
      for (const platform of input.profile.platforms) {
        const spec = DELIVERY_SPECS[platform];
        if (!spec) continue; // no technical spec encoded for this platform
        const checks = checkMaster(input.master, spec);
        const failed = checks.filter((c) => !c.ok);
        targets.push({ platform, label: spec.label, citation: spec.citation, passed: failed.length === 0, checks });
        for (const c of failed) findings.push(checkToFinding(input.scene_id, platform, spec, c, input.tau, input.now));
      }
    }

    return {
      report: {
        scene_id: input.scene_id,
        master: input.master,
        targets,
        passed: targets.every((t) => t.passed),
        computed_at: input.now,
      },
      findings,
    };
  }
}

export const gateDelivery = new GateDelivery();
