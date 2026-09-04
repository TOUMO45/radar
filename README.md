# Radar

Closed-loop QA radar for AI-generated film content. A script goes in; scenes are
generated; deterministic **gates** (continuity, clearance, audio, AI-disclosure)
raise **findings** in one shared schema; a bounded **remediation loop** regenerates
bad shots; a scene **LOCKs** only when a total lock rule holds, then a KMS-signed,
hash-chained **certificate** is issued. An MCP server exposes the whole QA
department to any pipeline.

Built for the **Agentic Cinema hackathon (Grafana Labs partner track)**. Two halves,
one system: a **deterministic engine** (TypeScript monorepo — the gates, World State,
loop, certifier, verifier, Review Console) and an **agentic layer** (`services/agent`,
a Python Google ADK agent — Gemini + Grafana Cloud MCP — that satisfies the hard
requirement: *real runtime use of Google Cloud + the partner service, called in code*).

Design spec: `scenelock-v2-full-stack-design.md` (Parts A–H + appendices).

---

## Status — all 8 phases (P0–P7) + 2026 compliance vertical + roadmap R1–R8 + Quick Scan + 6 additive "wow" routes ✅  ·  **256 tests green across 25 packages, 49/49 turbo test tasks, 51/51 typecheck**

Every phase from the spec's build plan (H.1) is implemented and verified against its
exit criterion, plus the **whole 2026 roadmap** shipped on top: the synthetic-media
compliance & Trust vertical, the **E&O / Underwriting Pack** (R1), **live C2PA
provenance verification** (R2), an **expanded jurisdiction/platform rulepack** (R3),
**technical-delivery QC** (R4, EBU R128 / IMF / DCP), a **likeness-rights marketplace**
(R5), **music cue sheets + certificate appendix** (R6), **compliance-diff over the
self-healing loop** (R7), and a **portfolio / slate roll-up** (R8). The deterministic
engine runs **DRY_RUN** — no GCP project, no API keys — behind an adapter seam
(`packages/ports`) so Firestore / Pub-Sub / Vertex / KMS / Veo / Gemini adapters drop in
later without touching service code. The console is a grouped **Control Room** app
(sidebar nav, 14 screens) with live self-heal and licensing actions.

The **agentic layer is live**: `services/agent` runs a real Gemini (Vertex) turn and a
real Grafana Cloud MCP connection — the hard partner-track requirement — with the
budget/lock rules enforced deterministically in code. Its layered self-test
(`python services/agent/radar_agent.py`) reports **G1–G6 all passing**.

| Package | What | Phase |
|---|---|---|
| `packages/schema` | **The contract** (spec principle 5). Zod types: Finding v2, Entity + state machines, Shot/GateRun/MediaArtifacts, Scene + verdict_inputs, Directive/Attempt, Certificate + hash chain, KG, Consent, MCP token/audit, Incident, SceneBench, SSE events, **compliance (ShotProvenance / ComplianceProfile / TrustScore / DeliveryReadiness)**. | P0+ |
| `packages/config` | Control Room design tokens, τ / loop-budget defaults, provider cost map, degraded-mode τ bump (D6). | P7 |
| `services/verdict` | **The lock rule as a total pure function** (E.4 + G-02). 18 tests incl. `fast-check` fuzz: *a scene can never LOCK with an unresolved blocking finding or incomplete gate/C2PA coverage*. | P0 |
| `packages/fixtures` | **DRY_RUN demo spine** (D11 / H.2). Act 1 scene `sc_12`, 6 shots, 8 findings. Validates against the contract. | P0 |
| `packages/ports` | **The adapter seam** (your "local now, cloud later" call). `StoragePort` / `EventBusPort` / `Clock` / `IdGen` interfaces + in-memory adapters. Firestore & Pub/Sub adapters implement the same interfaces later — no service code changes. | P1 |
| `services/archivist` | **World State** (spec §4, E.1). Planner registers `planned` entities; gates record **candidate** observed states validated against the per-type state machines; **canonical** commit on LOCK; `queryWorldState` / `expectedState` = the ledger the gates check against. | P1 |
| `services/api` | **Core REST** (F.1). Now over `StoragePort`; mounts the archivist; adds entity register / propose-state / world-state routes; adjudication write path with D12 role + reason gates; SSE bridged from the event bus. | P0→P1 |
| `services/media-processor` | Keyframes / 16k-mono audio / **C2PA manifest read** (spec E.1). `MediaBackend` seam; `DryRunMediaBackend` derives artifacts from the seed. NOTE: decision D3 keeps the production impl in Python — this TS package is the DRY_RUN mock behind the `shots.raw → shots.processed` contract. | P2 |
| `services/gate-clearance` | **Clearance gate** (E.5.2): `ai_disclosure` (C2PA present/valid + generator vs veo_job_id payload-swap), `real_person` (KG figure NER × Consent Registry), `trademark` (label edit-similarity, OCR-calibrated), `lyrics` (n-gram window match, audio sub-gate). Deterministic cores + schema-validated `TemplateExplainer` (Gemini adapter later). Emits Finding v2 + `gate_run` records. | P2 |
| `services/incidents` | **IncidentWatchdog** (C.3 Flow B, E.11): a blocking, unresolved finding auto-opens one incident assigned to the Fixer; resolving/waiving auto-closes it with a note. `IncidentsPort` is the seam — Grafana Incidents in production. | P3 |
| `services/mcp` | **The protocol moat** (spec §9, E.6). JSON-RPC 2.0 over HTTP: all 9 §9 tools; per-org bearer tokens (sha-256 at rest) + per-tool scopes + append-only audit log. | P3 |
| `services/fixer` | **The remediation loop** (spec §6, E.3) — directive compiler + `VeoBackend` seam + the bounded state machine (`check_budget → compile → generate → process → rerun_gates → recompute → resolve \| iterate ≤2 \| escalate`), invariants re-verified post-regen (R2), infra failures free (G-06). **Cost governor** (E.12): 80% warn, 100% auto kill-switch. | P4 |
| `services/gate-continuity` | **Continuity gate** (E.5.1) — expected-vs-observed **state** (deterministic, blocking), **presence**, identity-embedding **drift** (hybrid, vs `T_id`), **unexpected** entities — all against the World State ledger. Observed → archivist as candidates. Version-pinned anchors; `archivist.reanchor()` (G-09). | P5 |
| `packages/rulepack` | **2026 synthetic-media rulepack** — cited, dated rules over `ShotProvenance`: EU AI Act Art. 50(2)/(4), CA AB 1836/2602, NY synthetic-performer, TikTok/YouTube/Meta/SVOD/broadcast/festival AI-label policies. Pure data + `evaluateShot`. | R (2026) |
| `services/gate-compliance` | **Compliance gate** — turns rulepack violations into Finding v2 (clearance-family), so a legal violation flows through `blocking` → verdict → loop → certificate. Deterministic + cited. | R (2026) |
| `packages/trust` | **Radar Trust Score** (one 0–100 headline per scene) + **Delivery Readiness** (per-territory / per-platform can-ship matrix). Deterministic roll-ups; any open blocking legal issue forces RED. | R (2026) |
| `services/gate-delivery` | **Technical delivery QC** (roadmap R4) — the assembled master vs each platform's IMF/broadcast/DCP spec (loudness, captions, frame rate, resolution, colour, codec); cited standards (EBU R128, SMPTE ST 2067, DCI DCP). | R4 (2026) |
| `services/gate-music` | **Music rights** (roadmap R6) — generates the PRO cue sheet and flags uncleared cues (`music_rights`); the cue sheet rides in the signed certificate's appendix. | R6 (2026) |
| `services/marketplace` | **Likeness-rights marketplace** (roadmap R5) — quote + execute digital-replica licences (Vermillio/Loti/CMG) behind `LikenessMarketplacePort`; issues the consent record that clears the finding. | R5 (2026) |
| `services/provenance` | **Live provenance verification** (roadmap R2) — turns *declared* C2PA/watermark into *verified* by running the ContentAuth **`c2patool`** over asset bytes (manifest integrity, cert trust, IPTC AI-source signal, soft-binding watermark). `ProvenancePort` seam + DRY_RUN adapter. Deterministic parser, tested against real tool output and a genuine signed image. | R2 (2026) |
| `packages/underwriting` | **E&O / Underwriting Pack** (roadmap R1) — one deterministic bundle a distributor's insurer reads to bind AI-content coverage: per-shot AI-disclosure schedule, consent ledger, provenance/C2PA chain, clearance + compliance findings with waiver trail, the signed certificate, trust + delivery readiness, and an **underwriter's checklist** (each 2026 E&O requirement → pass/fail with citation). `assembleUnderwritingPack` + `renderUnderwritingMarkdown`. | R1 (2026) |
| `services/certifier` | **Deterministic** certificate (Appendix D) — never an agent (D2). Compile → sha-256 **hash chain** per production → **KMS signature** (mock HMAC; Cloud KMS + rotation later, G-15) → verification slug. `verify(slug)` recomputes the hash, walks the chain, checks the signature. Signs on LOCK. | P6 |
| `services/verifier` | Tiny **public** `GET /verify/:slug` → status + hash chain. No auth, no PII (G-16). Standalone deployable + a route the API mounts. | P6 |
| `services/saboteur` | **Adversarial corpus** + **SceneBench** scorecards (§10, Part G) — evasion cases (split-line lyric, garbled label, mid-line name, C2PA payload-swap, …) → run the gates on a fresh store → catch-rate by risk class + FP rate at τ + `release_ok`. | P6 |
| `services/agent` | **Fixer / SRE-Copilot — the agentic layer** (Python ADK). A Gemini `LlmAgent` with the **Grafana Cloud MCP** toolset + safety settings; the budget cap (E.3/E.12) and lock rule (E.4/G-02) live in a dependency-free `radar_gates.py` and, when `SCENELOCK_API_BASE` is set, defer to the TS API so the rule has **one** cross-language authority (D5). Layered self-test: G1–G4 offline (zero deps), G5 live Grafana MCP, G6 real Gemini turn. | + |
| `apps/console` | **Review Console** — Next.js 15, "Control Room" (C.4). Productions (S1) + one-take demo runner; Overview (S2) — **CostMeter (C-12)** + **KillSwitchControl (C-20)**; **War Room (S3)** — Verdict Math Bar (C-02), filmstrip, **Evidence Canvas (C-09)**, dossier, live SSE, rerun-gates + **auto-remediate**; **Finding Inbox (S4)** + dossier drawer (S5) + adjudication/waiver (C-16); **Loop Monitor (S7)** — incidents, directives + **LoopStepper (C-11)**; **World State Browser (S6)** — **StateTimeline (C-10)**, drift sparkline; **Consent Registry (S8)**; **Certificate Viewer (S9)** + **HashChainView (C-17)**; public **`/verify/:slug`**; **SceneBench (S12)**; **Compliance & Delivery (S13)** — Trust Score gauge + Delivery Readiness matrix + cited findings; **E&O / Underwriting Pack (S14)** — bindable verdict, underwriter checklist, disclosure schedule, ledgers, `.md` binder export; **⌘K palette**, **DegradedBanner (C-21)**, **EmptyRadar (C-22)**, error boundaries; **BFF proxy** (D.2) + SSE pass-through + role switcher. | P0→P7 + R (M1–M5) |

Each phase was verified against its H.1 exit criterion before the next began:

**P0 exit** — `pnpm seed:verdict` → `HELD · open_blocking_findings · 3 blocking`.

**P1 exit** (*planner registers expected states; gates have a ledger*) — met: `POST …/entities`
→ `GET …/world-state?scene=` returns `expected_state`; observed states stay **candidate**
until `archivist.commitCanonical()` on LOCK.

**P2 exit** (*clearance findings live; console shows real evidence*) — met: `rerun-gates`
runs media-processor + gate-clearance across all 6 shots, replaces seed placeholders with
gate-computed `f_cl_*` findings, recomputes the verdict, drives the Evidence Canvas.

**P3 exit** (*alert → incident → assign; MCP `check_scene` from an external client*) — met:
3 blocking findings auto-open Fixer-assigned incidents; waiving one closes its incident.
External `curl` to `POST /mcp` runs `tools/list` + `check_scene`; no token → 401; out-of-scope → `-32003` + audit entry.

**P4 exit** (H.1: *"Flow B completes: HELD → regen ×2 → LOCKED auto"*) — met:
`POST /v1/scenes/sc_12/auto-remediate` compiles a directive per blocking finding, regenerates
(mock Veo), re-runs the gates, recomputes — `HELD (open_blocking_findings) → LOCKED (ok)` in
one attempt each, every incident auto-closed, `loop_attempts` 4/24, cost governor **green**.
`POST …/kill-switch {phrase:"PAUSE LOOP"}` (Producer/SRE) → verdict `kill_switch_engaged`;
a zero `loop_attempts_cap` trips the governor to `kill` and pauses the loop with findings intact.

**P5 exit** (*continuity deterministic findings live*) — met: `rerun-gates` runs **both**
gates; `f_ct_shot_3_CAN-01_state` (blocking), `_JACKET-01_presence`, `f_ct_shot_5_RIYA-01_identity`
are real gate output; `auto-remediate` still reaches LOCKED; `POST …/reanchor` repins anchors (G-09).

**P6 exit** (H.1: *"SceneBench v1 published; certificate signs & verifies"*) — met:
`auto-remediate` reaching LOCKED signs a hash-chained certificate; `GET /verify/:slug`
(no auth) returns `status: valid · chain_ok · signature_ok`, and tampering the stored payload
flips both to false. `POST /v1/bench/run` publishes a scorecard — 5 risk classes at 100%
catch-rate, **FP rate 0 at τ**, `release_ok: true`.

**P7 exit** (H.1: *"demo spine reproducible in one take"*) — met: `POST /v1/demo/run` replays
Acts 1–3 in one call over one SSE stream — `Gates sweep → Radar held → Self-heal` →
`HELD → LOCKED` + a signed, verifiable certificate; `POST /v1/demo/reset` returns to
`HELD · 3 blocking`. `packages/config` ships the shared tokens/defaults; the console adds
`⌘K`, `DegradedBanner`, `EmptyRadar`, and route error boundaries.

---

## Run it

```bash
pnpm install && pnpm build
pnpm --filter @scenelock/api dev       # http://localhost:4000  (also serves /mcp + /verify)
pnpm --filter @scenelock/console dev   # http://localhost:3000
```

Open `http://localhost:3000` → **▶ run demo (Acts 1–3)** on the Productions home, or walk a
production → **war room** → *auto-remediate scene*.

```bash
pnpm test && pnpm typecheck            # 139 tests, 50 turbo tasks
pnpm seed:verdict                      # P0 probe: DRY_RUN verdict on the seeded scene
```

## One-take demo

```bash
curl -s -XPOST localhost:4000/v1/demo/run    # reset → gates → held → self-heal → certified
curl -s localhost:4000/verify/<slug>         # public, no auth → status: valid
curl -s -XPOST localhost:4000/v1/bench/run -H 'x-scenelock-role: sre_admin'   # SceneBench
```

## The agent (partner track)

```bash
cd services/agent
python radar_gates.py                     # G1–G4 deterministic gates — zero deps, offline
pip install -r requirements.txt               # google-adk[mcp] + google-genai
cp .env.example .env                          # then fill in the values below
python radar_agent.py                     # G1–G6 (G5 = live Grafana MCP, G6 = real Gemini turn)
```

**G1–G4** pass with no credentials. **G6** (real Gemini) needs GCP ADC —
`gcloud auth application-default login` + `aiplatform.googleapis.com` enabled on your
`GOOGLE_CLOUD_PROJECT`. **G5** (Grafana MCP) uses the official `grafana/mcp-grafana`
OSS server over stdio with a Grafana **service-account token**: drop the binary in
`services/agent/bin/` (auto-detected) and set `GRAFANA_URL` +
`GRAFANA_SERVICE_ACCOUNT_TOKEN` in `.env` — no browser, headless, deterministic.
Leave the token blank to fall back to the hosted `mcp.grafana.com` OAuth endpoint.
See [`services/agent/README.md`](services/agent/README.md) for the full contract and the
single-source-of-truth reconciliation with the TS backend.

**Where Gemini and Grafana MCP are actually imported and called** (exact `file:line`,
verified against this repo's `services/agent/radar_agent.py`, not paraphrased):

| Requirement | File : line | What's there |
|---|---|---|
| Gemini import | [`radar_agent.py:102`](services/agent/radar_agent.py#L102) | `from google.adk.agents import LlmAgent` |
| Gemini model call | [`radar_agent.py:292-294`](services/agent/radar_agent.py#L292-L294) | `fixer_agent = LlmAgent(name="radar_fixer", model="gemini-2.5-flash", ...)` |
| Vertex routing | [`services/agent/.env.example`](services/agent/.env.example) | `GOOGLE_GENAI_USE_VERTEXAI=TRUE` — the ADK/genai client resolves this at runtime, routing the call above through Vertex AI + ADC rather than a bare API key |
| Grafana MCP import | [`radar_agent.py:104`](services/agent/radar_agent.py#L104) | `from google.adk.tools import FunctionTool, McpToolset` |
| Grafana MCP call (headless, default) | [`radar_agent.py:206-218`](services/agent/radar_agent.py#L206-L218) | `grafana_mcp = McpToolset(connection_params=StdioConnectionParams(...))` — launches the official `grafana/mcp-grafana` OSS server as a subprocess with a service-account token |
| Grafana MCP call (hosted fallback) | [`radar_agent.py:221-227`](services/agent/radar_agent.py#L221-L227) | `grafana_mcp = McpToolset(connection_params=StreamableHTTPConnectionParams(url="https://mcp.grafana.com/mcp", ...))` |
| Grafana MCP wired into the agent | [`radar_agent.py:317`](services/agent/radar_agent.py#L317) | `tools=[regenerate_tool, sign_certificate_tool, grafana_mcp]` — inside the same `LlmAgent(...)` construction as the model line above |

Both are exercised live, not just imported: `python radar_agent.py`'s self-test (G5, G6)
makes a real call through each of these — raw output in
[`TEST_REPORT.md`](TEST_REPORT.md) Step 3.

---

## Quick Scan — a separate, best-effort preliminary check

`GET /quickscan` in the console (linked from the header) and `POST /v1/quickscan` on the
API are a **deliberately separate, additive capability** — not part of the graded
production pipeline above, and never touching its routes, data, or behavior. Paste a
script excerpt or upload an image/video **with no pre-registered production** and get
back a preliminary findings list. No auth beyond a per-route rate limit (10 scans/min
per IP) — this is intentionally a public-ish entry point.

**What it does check**, over Quick Scan's own small watchlist
(`services/quickscan/src/watchlist.ts` — deliberately separate from the demo
production's `packages/fixtures` KG):
- **Trademark** and **lyrics** — text/phrase matching against a short, curated list of
  real reference entries (currently: the "Nike" wordmark; "Twinkle, Twinkle, Little
  Star", a genuinely real, well-known song that happens to be public domain).
- **Real-person name references** — same watchlist mechanism; currently seeded with no
  entries (the mechanism is tested, real names aren't pre-loaded without a stronger
  reason than a demo).
- **AI-disclosure / C2PA** — for an uploaded asset, a **real** verification via the same
  ContentAuth `c2patool` engine the production pipeline uses (`@scenelock/provenance`,
  roadmap R2) — genuinely checks the file's manifest, not a canned response.
- **Compliance-labeling** — the same cited 2026 rulepack (`@scenelock/gate-compliance`)
  run over the verified C2PA result, assuming the asset is AI-generated (Quick Scan has
  no way to detect that directly — stated in the finding text, not silently assumed).

**What it explicitly does *not* check**, every time, with a stated reason rather than a
silent omission:
- **Continuity** — inherently requires a production's World State; cannot exist
  standalone.
- **Consent verification** — a name match only says a real person *may* be referenced;
  whether a release is on file needs a specific production's Consent Registry, which a
  standalone scan doesn't have.
- Whichever of trademark/lyrics/real-person/C2PA/compliance-labeling doesn't apply to
  the input type submitted (e.g. C2PA doesn't apply to a text-only scan).

**What it is not**: no certificate, no signing, no Trust Score, no `blocking` status —
just a findings list, explicitly labeled as a preliminary scan. Every response carries
the same disclaimer: *"Quick Scan flags possible matches; it does not verify licensing
status. It is not legal advice."*

---

## Wow features — additive surface on top of the pipeline

Six additive routes (plus Grafana annotation wiring), each grounded in a real
competitive gap. **No billing anywhere. No existing route handler was modified** —
every one is new surface, proven by a full diff review and the full test suite
(250 tests / 51 typecheck tasks green, unchanged per-package counts). One
curl-based test per feature is in `TEST_REPORT.md` → "Wow Features"; the whole
sweep is `test_radar_e2e.sh`.

| Route | What it is |
|---|---|
| `GET /v1/productions/:pid/underwriting-pack` | **Live E&O pack.** The existing deterministic assembler (`packages/underwriting`), production-scoped, with a request-time `generated_at` (`SystemClock`) — regenerated every call, never a cached file. Returns `{ generated_at, scene_id, pack, markdown }`. Accepts a production id or a bare scene id. |
| `GET /v1/badge/:slug.svg` | **Public embeddable badge.** No auth, same trust model as `/verify` but exposes strictly less — a colour + a label. Green "✓ AI-Disclosed & Cleared" when the certificate verifies `valid`, red "✗ Not Certified" otherwise. Hand-built SVG, zero new dependency (`services/api/src/badge.ts`). |
| `POST /v1/quickscan` → `GET /v1/quickscan/:scanId` | **Shareable Quick Scan link.** Each scan is now persisted under a 128-bit id (`qs_` + 16 random bytes) and re-openable read-only. `POST` response gains `scan_id`; everything else is unchanged. In-process store (`quickscan-store.ts`), bounded, single-instance for the demo. |
| `GET /v1/partners` | **Partner map.** Vermillio · Loti · Interra BATON · Audible Magic · Grafana Cloud · Vertex/Gemini, each with a one-line role and an honest `status`: `live` **only** for Grafana + Vertex (agent goals G5/G6 pass live); `integration_port_defined` for the rest, each citing a real typed seam — `LikenessMarketplacePort`, and the new `TechnicalQcPort` / `MusicIdPort` in `packages/ports`. |
| `GET /v1/compliance/deadlines` | **Regulatory exposure clock.** The cited `effective` dates already in `packages/rulepack` (EU AI Act Art. 50, CA AB 1836/2602, NY, PRC, US NO FAKES/TAKE IT DOWN, platform policies), with `days_remaining` computed server-side from real `now`. Every tracked obligation is already in force, so the number is negative — days a production has been non-compliant if undisclosed. |
| `POST /v1/assistant/ask` | **Findings-grounded assistant.** `{production_id, question}`. Fetches the production's real findings, Trust Score and open-blocking count **server-side first**, passes them as grounding, calls Gemini with **zero tools** — it cannot regenerate, sign or adjudicate, refuses if asked ("I cannot…"), and resists prompt-injection in the question. Findings text is declared DATA-not-instructions (spec G-13). Rate-limited by the **same** preHandler as `/v1/quickscan`; same safety settings as the Python agent. Tries **Vertex first** (`gemini-2.5-flash` → `2.0-flash` → `2.5-pro`, when `GOOGLE_GENAI_USE_VERTEXAI=TRUE`) then the **Gemini API** (`gemini-3.6-flash` → `2.5-flash`), with backoff + a 25 s timeout; if every backend fails it still returns the real grounded numbers (HTTP 200, `model: null`). Response carries `grounding_check` — did the answer actually cite the real count. |

**Grafana wiring.** Features 1, 2, 3 and 6 each post a real annotation to Grafana
Cloud's HTTP Annotations API (`services/api/src/grafana.ts`) using the identical
service-account token the Python agent hands to `mcp-grafana` — direct HTTP, no
MCP round-trip (the agent's tool filter has no annotations tool). Fail-open: unset
env → no-op; error → swallowed; 3 s timeout. `E&O pack generated for sc_12`,
`Badge served: … (Cleared)`, `Quick Scan run: 2 findings`, `Assistant asked: …`.

**Deploy — live.** All six + the Grafana wiring run on Cloud Run
(`radar-api`, `us-central1`, `min/maxScale=1`) and pass a live sweep
(`bash deploy_wow.sh --verify-only` → `PASS=10 FAIL=0`). `deploy_wow.ps1`
(PowerShell) / `deploy_wow.sh` (Git Bash) is the one command: optional Vertex IAM
grant → env file from `services/agent/.env` → `gcloud run deploy --source .` →
mint a fresh certificate → PASS/FAIL sweep of all six + the Grafana count.

---

## Layout

```
packages/
  schema/           # JSON-contract types (Zod). The single source of truth.
  config/           # Control Room tokens · τ defaults · cost map (D6).
  fixtures/         # DRY_RUN demo spine (+ KG corpus, consent, shot text, continuity, tokens).
  ports/            # adapter seam: Storage/EventBus/Clock/IdGen + in-memory impls; vendor seams (Likeness/Provenance/TechnicalQc/MusicId).
  rulepack/         # 2026 synthetic-media law + platform policy as cited data (drives /v1/compliance/deadlines).
  underwriting/     # deterministic E&O / Underwriting Pack assembler (drives /v1/productions/:pid/underwriting-pack).
services/
  agent/            # Python ADK Fixer/SRE-Copilot — Gemini + Grafana MCP (the partner-track piece).
  verdict/          # computeVerdict() — the one home for lock logic (D5).
  archivist/        # World State — the ledger the gates check against (§4, §15).
  media-processor/  # keyframes / audio / C2PA read (mock; Python in prod, D3).
  gate-clearance/   # trademark · lyrics · real_person · ai_disclosure (E.5.2).
  incidents/        # blocking finding → incident → assign fixer → auto-close (E.11).
  mcp/              # the MCP server — §9 tools, token auth, scopes, audit (E.6).
  fixer/            # remediation loop + cost governor (§6, E.3, E.12).
  gate-continuity/  # expected-vs-observed state / presence / identity drift (E.5.1).
  certifier/        # deterministic cert + hash chain + KMS sign + verify (§8, D2).
  verifier/         # public GET /verify/:slug — no auth, no PII (G-16).
  saboteur/         # evasion corpus + SceneBench scorecards (§10, Part G).
  api/              # Fastify REST (F.1) over the ports. Mounts archivist + gates + loop + certifier;
                    #   + Quick Scan, and the additive "wow" routes (E&O pack · badge · scan link · partners · deadlines · assistant).
apps/
  console/          # Next.js BFF + Control Room UI (Parts C/D).
```

## MCP quick check

```bash
pnpm --filter @scenelock/mcp start   # :4100
curl -s localhost:4100/mcp -H 'authorization: Bearer radar_demo_neonharbor_ro' \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"check_scene","arguments":{"shots":["shot_3","shot_6"]}}}'
```

## What's mocked (and where the real thing plugs in)

Everything below is behind an interface in `packages/ports` or a `*Backend` seam — the
DRY_RUN implementation and the production one are swapped by construction, not by editing
callers.

| Seam | DRY_RUN today | Production |
|---|---|---|
| `StoragePort` | in-memory | Firestore (org-scoped paths, E.7) |
| `EventBusPort` | in-memory emitter | Pub/Sub topics (E.2) |
| `MediaBackend` | derives artifacts from the seed | Python: FFmpeg + chromaprint + c2pa (D3) |
| `ProvenancePort` (R2) | DRY_RUN from declared provenance; **real C2PA via `c2patool`** when an asset + binary are present | c2patool over real assets + SynthID (Vertex) pixel detection |
| `Explainer` | deterministic templates | Gemini, schema-validated, injection-guarded (E.10) |
| `VeoBackend` | scripted fix per risk class | Veo regeneration job + poll + ingest |
| `SignerBackend` | HMAC | Cloud KMS asymmetric key + rotation (G-15) |
| gate services | TS, fixture inputs | `gate-continuity` / `media-processor` in Python (D3) |
| MCP / verifier transport | JSON-RPC over HTTP / route on the API | own Cloud Run services |
| incidents | `IncidentWatchdog` | Grafana alert rule on `blocking=true` → Grafana Incidents |
| agent budget/lock gates | offline reference impl in `radar_gates.py` | `SCENELOCK_API_BASE` → the TS API (single authority) |
| agent Veo / KMS | `_call_veo` stub / fake hash | real Veo client / Cloud KMS sign — guards unchanged |
| agent Grafana MCP | **live** — official `grafana/mcp-grafana` OSS server over stdio + a Grafana **service-account token** (`GRAFANA_SERVICE_ACCOUNT_TOKEN`), 7 tools resolved; hosted `mcp.grafana.com` OAuth is the fallback | same, deploy the OSS server alongside the agent |
| agent Gemini | **live** — real Vertex `gemini-2.5-flash` turn via ADC (`GOOGLE_CLOUD_PROJECT` + `gcloud auth application-default login`) | Agent Engine deployment, same code |
| API assistant Gemini (`/v1/assistant/ask`) | **live** — Vertex `gemini-2.5-flash` when `GOOGLE_GENAI_USE_VERTEXAI=TRUE`, else Gemini API `gemini-3.6-flash` (`GEMINI_API_KEY`); grounding fetched server-side, zero tools | Vertex via the runtime SA (`roles/aiplatform.user`), same code |
| API → Grafana annotations (`services/api/src/grafana.ts`) | **live** — direct HTTP to the Cloud Annotations API with the agent's `glsa_…` service-account token; fail-open when env is unset | same token, same endpoint |
| `TechnicalQcPort` (Interra BATON), `MusicIdPort` (Audible Magic) | typed seam only — RADAR does the QC itself via `@scenelock/gate-delivery` / `gate-music` | vendor adapter behind the port + a partner key |
| `LikenessMarketplacePort` (Vermillio / Loti) | DRY_RUN quotes + issued consent record | partner API behind the same interface |

## Deliberate deviations from the spec text

- **E.4 "status = open"** is read as "unresolved": `in_remediation` and
  `escalated` findings also hold a scene. Only `resolved` / `waived` clear
  blocking. Enforced by a property test in `services/verdict`.
- **Reason priority:** `incomplete_c2pa_coverage` ranks *below*
  `open_blocking_findings` because a missing manifest always has a matching
  deterministic `ai_disclosure` finding (E.9) — the finding is the better
  headline. `incomplete_gate_coverage` (G-02, silent under-QA) still ranks above
  findings.
- Fonts referenced via CSS stacks, not `next/font/google`, so builds don't need
  network access to `fonts.gstatic.com`. Self-hosting Plex woff2 is M0 polish.
