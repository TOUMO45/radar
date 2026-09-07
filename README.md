# RADAR — closed-loop QA for AI-generated film

[![License: MIT](https://img.shields.io/badge/license-MIT-2bd576.svg)](LICENSE)
[![tests](https://img.shields.io/badge/tests-268%20passing-2bd576.svg)](#test-it-yourself-in-5-minutes)
[![deploy](https://img.shields.io/badge/Cloud%20Run-live-22d3ee.svg)](https://radar-console-qf2l7fjeqa-uc.a.run.app)

A script goes in. Scenes are generated. **Deterministic gates** — continuity, rights
clearance, synthetic-media compliance, technical delivery, music — raise **findings** in
one shared schema. A **bounded remediation loop** regenerates the bad shots. A scene
**LOCKs** only when a hard, total lock rule holds; then RADAR issues a **KMS-signed,
hash-chained certificate** and a **distributor-grade E&O / underwriting pack**. An MCP
server exposes the whole QA department to any pipeline.

Built for the **Agentic Cinema hackathon — Grafana Labs partner track**. Two halves, one
system: a **deterministic engine** (TypeScript monorepo — gates, World State, loop,
certifier, verifier, Review Console) and an **agentic layer** (`services/agent`, a Python
[Google ADK](https://google.github.io/adk-docs/) agent — Vertex AI Gemini + Grafana Cloud
MCP — that satisfies the hard requirement: *real runtime use of Google Cloud + the partner
service, called in code*).

## Live

| What | URL | Expect |
|---|---|---|
| API health | https://radar-api-qf2l7fjeqa-uc.a.run.app/health | `{"status":"ok","mode":"dry_run","service":"@scenelock/api"}` |
| Review Console | https://radar-console-qf2l7fjeqa-uc.a.run.app | the Control Room UI |

**Verify a live certificate.** The hosted API runs `DRY_RUN` on a single warm instance with
an in-memory store, so a certificate slug is real but not permanent — a `demo/reset` (the
console's **▶ run demo** button calls it) or a cold start regenerates it. Mint your own in
one call, then drop it into the three URLs below:

```bash
SLUG=$(curl -s -XPOST -H 'content-type: application/json' -d '{}' \
  https://radar-api-qf2l7fjeqa-uc.a.run.app/v1/demo/run \
  | grep -o '"slug":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "$SLUG"                                                     # e.g. sc12-c100227e0a22
curl -s https://radar-api-qf2l7fjeqa-uc.a.run.app/verify/$SLUG   # → "status":"valid", ...
```

| What | URL | Expect |
|---|---|---|
| **Verify a live certificate** | `https://radar-api-qf2l7fjeqa-uc.a.run.app/verify/$SLUG` | `"status":"valid","chain_ok":true,"signature_ok":true` |
| Same, rendered | `https://radar-console-qf2l7fjeqa-uc.a.run.app/verify/$SLUG` | a **✓ VALID** page with the hash chain |
| Embeddable badge | `https://radar-api-qf2l7fjeqa-uc.a.run.app/v1/badge/$SLUG.svg` | a green **✓ AI-Disclosed &amp; Cleared** SVG |

Badge embed (drops into any README or shot sheet):

```markdown
![RADAR clearance](https://radar-api-qf2l7fjeqa-uc.a.run.app/v1/badge/<SLUG>.svg)
```

## The problem

2026 E&O (errors &amp; omissions) policies now **exclude AI-generated content** unless the
production can document consent, clearance and provenance for every synthetic element — and
every major distributor still requires **$1M per claim / $3M aggregate** E&O to sign a
distribution deal. So an AI-assisted film can be finished and still be un-releasable: the
footage exists, but the paper an underwriter needs to bind coverage does not. RADAR is that
paper, produced continuously as a side effect of QA — a per-shot AI-disclosure schedule, a
consent ledger, a verified provenance chain, a findings ledger with the waiver trail, and a
signed certificate — assembled into the single binder an insurer actually reads.
(Source: `ENHANCEMENTS.md` §R1.)

## Architecture

### System

```mermaid
flowchart TB
  Console["Review Console — Next.js 15"]
  Pipeline["External pipeline"]
  BFF["BFF proxy /api/* — injects role token"]

  subgraph API["Core API — Fastify, services/api (DRY_RUN behind packages/ports)"]
    direction TB
    Gates["Deterministic gates: continuity, clearance, compliance, delivery, music"]
    Loop["Remediation loop: budget gate + Fixer + mock Veo"]
    Certifier["Certifier: sha-256 hash chain + KMS signature"]
    Prov["Provenance: ContentAuth c2patool"]
    Quick["Quick Scan"]
    Assist["Grounded assistant — read-only, zero tools"]
  end

  Verify["Public GET /verify/:slug — no auth, no PII"]
  MCP["MCP server — standalone :4100, run locally"]
  Store[("StoragePort — in-memory DRY_RUN; Firestore adapter drops in")]
  Gemini["Vertex AI — Gemini 2.5 Flash"]

  subgraph Agent["Agentic layer — Python Google ADK, services/agent"]
    direction TB
    Fixer["radar_fixer LlmAgent"]
    Grafana["Grafana Cloud MCP — mcp-grafana over stdio"]
  end

  Console --> BFF --> API
  Pipeline --> MCP --> Gates
  Gates --> Loop --> Certifier --> Verify
  Gates --> Prov
  Assist --> Gemini
  Gates --> Store
  Loop --> Store
  Certifier --> Store
  Quick --> Store
  Assist --> Store
  Fixer --> Gemini
  Fixer --> Grafana
  Fixer -. "SCENELOCK_API_BASE — one cross-language rule authority" .-> Loop
```

### The self-healing loop

```mermaid
sequenceDiagram
  autonumber
  participant F as Blocking finding
  participant Fx as Fixer / loop
  participant B as Budget gate (E.3 / E.12)
  participant Veo as Veo backend (mock)
  participant G as Gates re-check
  participant C as Certifier — lock rule (E.4 / G-02)
  participant K as KMS signer

  F->>Fx: open blocking finding
  Fx->>B: attempt N within cost caps?
  alt caps exceeded
    B-->>Fx: refused → escalate (no silent overrun)
  else within budget
    B-->>Fx: ok
    Fx->>Veo: regenerate shot with directive + invariants
    Veo-->>Fx: new shot, provenance re-marked
    Fx->>G: re-run clearance + continuity on the shot
    G-->>Fx: shot findings reconciled
    alt target still open and N < loop budget
      Fx->>B: next attempt
    else resolved or budget spent
      Fx->>C: scene ready to lock?
      C->>C: total lock rule — 0 open blocking, gates 18/18, C2PA coverage, kill switch clear
      alt rule holds
        C->>K: sign canonical bytes
        K-->>C: signature
        C-->>Fx: LOCKED + hash-chained certificate
      else rule fails
        C-->>Fx: refused with reason — scene stays HELD
      end
    end
  end
```

## Hackathon compliance

Every row is verifiable in under a minute with no help from us.

| Requirement | Evidence |
|---|---|
| Hosted, publicly reachable | Console <https://radar-console-qf2l7fjeqa-uc.a.run.app> · API <https://radar-api-qf2l7fjeqa-uc.a.run.app/health> — both HTTP 200, no auth. Cloud Run, `us-central1`, `--min/--max-instances=1`. |
| Public repo + OSI license | this repository · [`LICENSE`](LICENSE) — **MIT** |
| Google Cloud used **at runtime** | [`services/api/src/assistant.ts:125`](services/api/src/assistant.ts#L125) `new GoogleGenAI({ vertexai: true, project, location })` → [`assistant.ts:203`](services/api/src/assistant.ts#L203) `ai.models.generateContent({ ... })`. Route [`services/api/src/app.ts:380`](services/api/src/app.ts#L380) `POST /v1/assistant/ask`. The deployed `radar-api` sets `GOOGLE_GENAI_USE_VERTEXAI=TRUE`, so this call runs through Vertex AI on Application Default Credentials. Also [`services/agent/radar_agent.py:294`](services/agent/radar_agent.py#L294) `LlmAgent(model="gemini-2.5-flash")`. |
| Grafana MCP used **at runtime** | Agent: [`services/agent/radar_agent.py:104`](services/agent/radar_agent.py#L104) `from google.adk.tools import ... McpToolset` → [`radar_agent.py:206`](services/agent/radar_agent.py#L206) `McpToolset(connection_params=StdioConnectionParams(...))` launching `grafana/mcp-grafana`, wired into the agent at [`radar_agent.py:317`](services/agent/radar_agent.py#L317) `tools=[..., grafana_mcp]`; the `python radar_agent.py` self-test **G5** resolves live tools. Product path: [`services/api/src/grafana.ts:41`](services/api/src/grafana.ts#L41) `fetch(\`${GRAFANA_URL}/api/annotations\`, ...)` posts a real annotation on every wow-route call. |
| Partner track selected | **Grafana Labs** — contract + reconciliation in [`services/agent/README.md`](services/agent/README.md) |
| Demo video | _add link here_ &nbsp;`<!-- TODO: paste the hosted video URL -->` |

## Test it yourself in 5 minutes

All three probe scripts and the agent self-test run against the **live** deployment. Start
by minting a fresh certificate slug (the scripts need one for the verify / badge checks):

```bash
SLUG=$(curl -s -XPOST -H 'content-type: application/json' -d '{}' \
  https://radar-api-qf2l7fjeqa-uc.a.run.app/v1/demo/run \
  | grep -o '"slug":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "$SLUG"
```

**1 — functional smoke** (`test_radar_e2e.sh`: health, the certified pipeline, Quick Scan,
all six wow features):

```bash
BASE_URL=https://radar-api-qf2l7fjeqa-uc.a.run.app \
CONSOLE_URL=https://radar-console-qf2l7fjeqa-uc.a.run.app \
KNOWN_VERIFY_SLUG=$SLUG \
TEST_PRODUCTION_ID=sc_12 \
./test_radar_e2e.sh
```

**2 — adversarial / RBAC probe** (`pentest_radar.sh`: identity spoofing, role escalation,
verify-slug enumeration, budget-cap race). MCP checks target a **local** MCP process (the
hosted deployment is API + console only), so point `MCP_URL` at your own run or ignore the
MCP rows:

```bash
BASE_URL=https://radar-api-qf2l7fjeqa-uc.a.run.app \
KNOWN_VERIFY_SLUG=$SLUG \
./pentest_radar.sh
```

**3 — wow-surface bug hunt** (`bughunt_wow_features.sh`: badge SVG injection, Quick Scan
input robustness, assistant prompt-injection, assistant rate-limit under concurrency,
underwriting-pack access control, scan-id entropy, error hygiene):

```bash
BASE_URL=https://radar-api-qf2l7fjeqa-uc.a.run.app \
KNOWN_VERIFY_SLUG=$SLUG \
TEST_PRODUCTION_ID=sc_12 \
./bughunt_wow_features.sh
```

> Test 4 in `bughunt_wow_features.sh` fires real concurrent calls to `/v1/assistant/ask`,
> which spends real Vertex Gemini quota. Default `ASSISTANT_CONCURRENCY=15`; raise it only
> if you intend to.

**4 — the agent self-test** (deterministic gates + a real Gemini turn + a real Grafana MCP
tool resolution):

```bash
cd services/agent
python radar_gates.py                 # G1–G4: the two lock rules, pure functions, zero deps, offline
pip install -r requirements.txt       # google-adk[mcp], google-genai, python-dotenv
cp .env.example .env                  # then fill in the Google Cloud + Grafana values it lists
python radar_agent.py                 # G1–G6: G5 = live Grafana MCP tools, G6 = real Vertex Gemini turn
```

`G1–G4` pass with no credentials. `G6` needs `GOOGLE_GENAI_USE_VERTEXAI=TRUE` +
`GOOGLE_CLOUD_PROJECT` + `gcloud auth application-default login`. `G5` needs `GRAFANA_URL` +
`GRAFANA_SERVICE_ACCOUNT_TOKEN` (headless mode — the `grafana/mcp-grafana` binary goes in
`services/agent/bin/`, auto-detected) or falls back to hosted `mcp.grafana.com` OAuth.

## Features

**Five deterministic gates** — every finding is cited, reproducible, and flows through the
same `blocking → verdict → loop → certificate` path:

| Gate | What it checks |
|---|---|
| **continuity** (E.5.1) | expected-vs-observed entity **state**, **presence**, and identity-embedding **drift** against the World State ledger |
| **clearance** (E.5.2) | `ai_disclosure` (C2PA present/valid + generator vs `veo_job_id` payload-swap), `real_person` (KG figure NER × Consent Registry), `trademark` (label edit-similarity, OCR-calibrated), `lyrics` (n-gram window match on the transcript) |
| **compliance** (2026) | rulepack violations → findings, cited to EU AI Act Art. 50, CA AB 1836 / AB 2602, NY synthetic-performer law, PRC labelling measures, and platform policies |
| **technical delivery** (R4) | the assembled master vs each targeted platform's real spec — EBU R128 (broadcast), SMPTE ST 2067 / Netflix (IMF), DCI DCP (theatrical), YouTube web loudness |
| **music rights** (R6) | generates the PRO cue sheet, flags uncleared cues (`music_rights`); the cue sheet rides in the certificate's appendix |

**Six additive "wow" routes** — new surface, zero regression to the pipeline:

| Route | What it does |
|---|---|
| `GET /v1/productions/:pid/underwriting-pack` 🔒 | the live E&O binder (JSON + `.md`), regenerated every call with a fresh `generated_at`; **gated** to `producer` / `legal` / `sre_admin` |
| `GET /v1/badge/:slug.svg` | public embeddable SVG — green **✓ Cleared** for a valid slug, red **✗ Not Certified** otherwise; `cache-control: public, max-age=30` |
| `POST /v1/quickscan` + `GET /v1/quickscan/:scanId` | standalone preliminary check (text or media), no production required; returns a 128-bit `qs_…` id that re-opens the result read-only |
| `GET /v1/partners` | the partner map — every adjacent service RADAR orchestrates, each row's `status` and `cite` backed by a real seam or call site |
| `GET /v1/compliance/deadlines` | a regulatory **exposure clock** over the cited effective dates in the rulepack |
| `POST /v1/assistant/ask` | a findings-grounded assistant — grounding fetched server-side first, **zero tools**, rate-limited, refuses to take any action or change a verdict |

## Competitive positioning

Detection, provenance and likeness-licensing tools each solve one slice. RADAR's wedge is
the **combination**: deterministic film-QA + jurisdiction-aware deliverability + a bounded
self-healing loop + an **E&O-ready certificate and underwriting pack** — the artifact that
actually unblocks a distribution deal, which none of the point tools produce. Adjacent
services are **intentionally orchestrated, not rebuilt**: digital-replica licensing
(**Vermillio**, **Loti**) drops in behind [`LikenessMarketplacePort`](packages/ports/src/marketplace.ts#L22);
broadcast/IMF/DCP conformance (**Interra Systems BATON**) behind
[`TechnicalQcPort`](packages/ports/src/technical-qc.ts#L32); audio content-ID
(**Audible Magic**) behind [`MusicIdPort`](packages/ports/src/music-id.ts#L37). Each is a
typed seam with a mock adapter today and a documented endpoint + credential contract for a
real vendor — see `GET /v1/partners`, where nothing unbuilt is labelled `live`.

## Local development

```bash
pnpm install && pnpm build
pnpm --filter @scenelock/api dev        # http://localhost:4000  (also serves /verify/:slug)
pnpm --filter @scenelock/console dev    # http://localhost:3000  (SCENELOCK_API_BASE defaults to :4000)
```

Open <http://localhost:3000> → **▶ run demo (Acts 1–3)** on the Productions home, or walk a
production → **War Room** → *auto-remediate scene*.

```bash
pnpm test && pnpm typecheck             # 268 tests / 25 packages · 49/49 test tasks · 51/51 typecheck
pnpm seed:verdict                       # P0 probe → "HELD · open_blocking_findings · 3 blocking"

curl -s -XPOST localhost:4000/v1/demo/run                       # reset → gates → held → self-heal → certified
curl -s localhost:4000/verify/<slug>                            # public, no auth → "status":"valid"
curl -s -XPOST localhost:4000/v1/bench/run \
  -H 'authorization: Bearer radar_dev_producer_9f2a7c1e'        # SceneBench scorecard
```

Optional standalone services: MCP server on `:4100` (`pnpm --filter @scenelock/mcp dev`),
verifier on `:4200` (`pnpm --filter @scenelock/verifier dev`).

To deploy your own copy: `bash deploy_wow.sh` (or `.\deploy_wow.ps1` on Windows) runs
`gcloud run deploy --source .` for `radar-api` with `--min/--max-instances=1`, mints a
fresh certificate, and runs a live PASS/FAIL sweep; `bash deploy_wow.sh --verify-only`
skips the deploy. `deploy_console.ps1` builds and deploys `radar-console` with the API URL
baked in. GCP setup is in [`SETUP.md`](SETUP.md).

## Known limitations — stated up front

- **The hosted certificate is ephemeral.** `DRY_RUN`, single warm instance, in-memory
  store — `sc12-7e67efdc57bd` is valid now but a `demo/reset` or cold start regenerates it.
  The mint-a-fresh-slug one-liner is at the top of this file. A Firestore `StoragePort`
  adapter is the drop-in for persistence.
- **The underwriting pack is gated** to `producer` / `legal` / `sre_admin` (401 with no
  token, 403 with the wrong role). This is deliberate — a 2026-09-05 bug-hunt audit found
  it publicly readable with real subject names and a consent-document URI, and it was
  closed. The console reaches it with a dev bearer token server-side; a hosted
  `curl` needs `-H 'authorization: Bearer <role token>'` (dev tokens are in
  `services/api/src/auth.ts`).
- **Quick Scan's watchlist is a small seed dataset** ([`services/quickscan/src/watchlist.ts`](services/quickscan/src/watchlist.ts)):
  one trademark (Nike) and one public-domain lyric ("Twinkle, Twinkle, Little Star"). The
  matching *code* (edit-similarity, n-gram window) is real; the data it matches against is
  intentionally minimal. It is not a general brand/lyric detector.
- **Continuity needs a registered production.** It compares observed state to a World State
  ledger, which only exists for a real production — a standalone Quick Scan reports
  continuity as `not_applicable`, by design.
- **MCP is not in the hosted deployment.** Only `radar-api` + `radar-console` are on Cloud
  Run. Run the MCP server locally (`:4100`) to exercise it.
- **Veo and the Gemini *explainer* are mocked.** The self-healing loop regenerates shots
  with a scripted `MockVeoBackend`; the live Gemini calls are the grounded *assistant* and
  the agent's *reasoning*, not shot generation. Real Veo drops in behind `VeoBackend`.

## Repository layout

```
packages/
  schema/        # the contract — Zod: Finding v2, entities, verdict inputs, certificate, RBAC, SSE
  ports/         # adapter seams — StoragePort, EventBusPort, Clock, the partner ports (local now, cloud later)
  rulepack/      # cited synthetic-media rules over ShotProvenance (EU/US/UK/CN + platforms)
  trust/         # Trust Score (0–100) + Delivery Readiness matrix
  underwriting/  # deterministic E&O / underwriting-pack assembler
  fixtures/      # DRY_RUN demo spine — scene sc_12, 6 shots, 8 findings, KG corpus, consent
services/
  api/           # Fastify REST — verdict, adjudication, loop, wow routes; mounts /verify
  verdict/       # computeVerdict() — the single home for lock logic (D5)
  archivist/     # World State ledger — planned / candidate / canonical
  media-processor/  gate-clearance/  gate-continuity/  gate-compliance/  gate-delivery/  gate-music/
  provenance/    # live C2PA verification via ContentAuth c2patool
  quickscan/     # standalone preliminary check + its own watchlist
  fixer/         # remediation loop — budget gate, directive compiler, mock Veo
  incidents/     # blocking + unresolved → open incident; resolve → close
  certifier/     # hash chain + KMS signature; verify(slug) recomputes and walks the chain
  verifier/      # tiny public GET /verify/:slug
  saboteur/      # adversarial corpus + SceneBench scorecards
  marketplace/   # likeness-rights marketplace mock behind LikenessMarketplacePort
  mcp/           # JSON-RPC 2.0 MCP server (standalone :4100)
  agent/         # Python Google ADK Fixer/SRE agent — Vertex Gemini + Grafana Cloud MCP
apps/
  console/       # Next.js 15 Review Console + BFF proxy
```

## License

[MIT](LICENSE) © 2026 Kamari Fatima Zohra
