# Radar 2026 — Enhancement Roadmap

Research-grounded ideas to make Radar the definitive QA + compliance radar for
AI-generated cinema. Section 1 is **shipped** (built and tested this session);
Section 2 is the **proposed roadmap**, ordered by impact. Sources at the bottom.

The wedge: existing tools do *one* of detection (Reality Defender), provenance
capture (Truepic / C2PA), or likeness licensing (Vermillio, Loti). **None** couple
deterministic film QA (continuity + clearance) with jurisdiction-aware
*deliverability* and a self-healing loop that ends in an insurer-grade certificate.
That combination is Radar's unique ground.

---

## 1. Shipped this session — Synthetic-Media Compliance & Trust

A whole new axis alongside continuity and clearance: **provable, jurisdiction-aware
deliverability**. All deterministic, all cited, no API keys — runs on DRY_RUN today.

| Piece | What it does |
|---|---|
| `packages/rulepack` | 2026 synthetic-media law + platform policy as **cited, dated** rules over shot provenance: EU AI Act Art. 50(2)/(4), CA AB 1836/2602, NY synthetic-performer, TikTok/YouTube/Meta/SVOD/broadcast/festival policies. |
| `services/gate-compliance` | A deterministic gate turning rule violations into Finding v2 (clearance-family), so a legal violation flows through `blocking` → verdict → loop → certificate for free. |
| `packages/trust` | **Radar Trust Score** (one 0–100 headline per scene) + **Delivery Readiness** (per-territory / per-platform "can this ship right now?"). |
| schema `compliance.ts` | `ShotProvenance`, `ComplianceProfile`, `Jurisdiction`, `Platform`, `TrustScore`, `DeliveryReadiness` — additive, backward-compatible. |
| API | `GET /v1/scenes/:sid/{compliance,trust-score,delivery-readiness}`, `GET/PUT /v1/productions/:pid/compliance-profile`. |
| Console | `/p/:pid/compliance` — Trust Score gauge + Delivery Readiness matrix + cited findings; a Trust chip on the overview. |
| `packages/underwriting` | **E&O / Underwriting Pack** (roadmap R1, shipped) — one deterministic bundle: per-shot AI-disclosure schedule, consent ledger, provenance/C2PA chain, clearance + compliance findings with waiver trail, the signed certificate, trust + delivery readiness, and an **underwriter's binder checklist** (each E&O requirement → pass/fail with citation). `assembleUnderwritingPack` + `renderUnderwritingMarkdown`. |
| API (R1) | `GET /v1/scenes/:sid/underwriting-pack` (JSON) + `…/underwriting-pack.md` (human binder). |
| Console (R1) | `/p/:pid/underwriting` — bindable verdict, checklist, disclosure schedule, ledgers, certificate; "open binder (.md)" export; linked from Overview + Compliance. |

On the "Neon Harbor" demo seed this produces a **Trust Score of 21 (RED)**, EU +
California **BLOCKED** for delivery (Art. 50 marking/label + AB 1836 deceased-replica
consent), and 9 cited findings — with zero cloud dependencies. The Underwriting Pack on
the same seed reads **"GAPS — not yet bindable"** and names the exact 5 blocking gaps an
underwriter would raise (shot_6 undisclosed, shot_4 unlabelled deceased-replica + missing
consent, open blocking findings, no certificate yet); after `auto-remediate` reaches
LOCKED it carries the signed certificate.

---

## 2. Proposed roadmap

### R1 — E&O / Underwriting Pack export  ✅ **SHIPPED** (this session)
2026 E&O policies now **exclude AI-generated content** unless the production can
document consent, clearance and provenance — and every major distributor requires
**$1M per claim / $3M aggregate** E&O to sign a distribution deal. Radar already held
exactly what an underwriter asks for; R1 assembles it into the single binder they read.
Delivered as `packages/underwriting` (deterministic, no keys), two API endpoints
(JSON + Markdown), and the `/p/:pid/underwriting` console page. 11 new tests
(7 package + 4 API). *Pure code on top of the certifier + compliance data.*
Next: a PDF render of the same pack (the `.md` is the intermediate) and a
production-level roll-up across scenes.

### R2 — Live provenance verification  ✅ **SHIPPED**
`ShotProvenance` used to be a *declared* input; R2 makes it *verified*. New
`packages/ports` `ProvenancePort` + `services/provenance` with a **real C2PA
verification adapter** running the ContentAuth **`c2patool`** over the asset bytes —
manifest integrity (hashes/claim signature), trust (cert anchor), the AI-generation
signal (IPTC `digitalSourceType`), and soft-binding watermark. `POST
/v1/shots/:id/verify-provenance` folds the verified result back onto the shot so Trust
/ Delivery / the E&O pack reflect **proof**, not a claim — exactly what EU Art. 50(2)
demands. 12 tests, **including a live check of a genuine C2PA-signed image**. SynthID
pixel-level detection stays a documented Vertex seam. *C2PA is open, no keys.*

### R3 — Jurisdiction & platform expansion  ✅ **SHIPPED**
Added **US federal** (NO FAKES / TAKE IT DOWN — digital-replica consent), **Australia**
(synthetic-voice disclosure), **UK** (Ofcom + Online Safety Act deepfake disclosure),
**China** (PRC AI-content labeling measures, eff. 2025-09-01 — explicit + implicit
label rules), and platforms **Instagram, X, theatrical DCP**. 8 cited rules, +7 tests.
Verified live via delivery-readiness. *Pure cited data, no keys.* (IMF/SVOD *technical*
QC — photon/loudness/caption — remains R4 below.)

### R4 — Technical-delivery QC  ✅ **SHIPPED**
A new `delivery` gate (`services/gate-delivery`) checks a scene's assembled master
against each platform's **technical** spec — loudness, captions, frame rate, resolution,
colour space, bit depth, codec — with real cited standards (EBU R128 broadcast,
Netflix/IMF SVOD, DCI DCP, YouTube). `GET /v1/scenes/:sid/technical-delivery` + a
Delivery QC console page. Positions Radar next to Baton/Vidchecker, AI-native. 10 tests.
*(Deep frame-level media QC via ffmpeg is a further extension; the spec/threshold
engine is complete.)*

### R5 — Likeness-rights marketplace  ✅ **SHIPPED**
A `likeness_rights` finding now offers a resolution path: `GET /v1/shots/:id/likeness-
options` returns quotes from digital-replica licensing providers (Vermillio / Loti /
CMG for estates), `POST …/clear-likeness` executes one, files the consent record and
links it to the shot — the finding resolves. Deterministic `MockLikenessMarketplace`
behind `LikenessMarketplacePort` (real partner API later). 7 tests; wired into the
compliance UI (verified live: findings 1 → 0).

### R6 — Music & audio rights  ✅ **SHIPPED**
`services/gate-music` generates the PRO-standard **cue sheet** from per-scene music cues
and turns uncleared cues into `music_rights` findings; the signed **certificate carries
the cue sheet as an appendix**. `GET /v1/scenes/:sid/cue-sheet` + a Music & Cues page.
5 tests; certificate verify unaffected.

### R7 — Compliance diff over the loop  ✅ **SHIPPED**
The self-healing loop now emits *marked* shots (a compliant re-render sets C2PA +
watermark + label on provenance, never fabricating consent). `POST /v1/scenes/:sid/
compliance-diff` snapshots before, runs the loop, snapshots after and returns the delta
— resolved rules, remaining rules, and the Trust delta. A live "run self-heal" panel
shows Trust climbing (21 → 43 on the demo) while consent rules correctly stay open.
1 test; nothing in the lock path changed.

### R8 — Portfolio / slate roll-up  ✅ **SHIPPED**
A producer's executive view across the whole slate: every production's Trust Score,
delivery-readiness and E&O-bindability, rolled up from the same per-scene numbers.
`GET /v1/orgs/:orgId/portfolio` + a slate summary and per-production trust chip on the
Productions home. +1 test; verified live. *Pure code.* (Trust *trend over time* needs a
snapshot store — a natural follow-on.)

---

## Sources (public, consulted for the rulepack + roadmap)

- EU AI Act, Article 50 — transparency obligations for synthetic content, applies **2026-08-02** (machine-readable marking, deepfake disclosure, perceptible label for real-person deepfakes; fines up to €15M / 3% turnover).
- California **AB 1836** (deceased-performer digital replicas, est. 2026-01-01) and **AB 2602** (living-performer replicas, est. 2025-01-01).
- **New York Synthetic Performer Disclosure Law** (eff. 2026-06-09).
- TikTok / YouTube / Meta AI-content labeling policies (2026).
- **C2PA Content Credentials** v2.3 (Jan 2026) and **Google SynthID** (OpenAI/Google alignment, 2026).
- Generative-AI **E&O insurance** landscape 2026 (ISO AI exclusions; $1M/$3M distributor requirement; AI disclosure + SAG-AFTRA digital-replica documentation required to bind coverage).

*Radar is a radar, not a lawyer: each rule states what a public obligation requires and
whether provenance meets it. A human decides. This document is engineering guidance, not
legal advice.*
