# services/agent — Radar Fixer / SRE-Copilot (Python ADK)

The **agentic layer** of Radar and the piece the hackathon literally checks:
*real runtime use of Google Cloud (Gemini via Vertex / Agent Builder) and the
partner service (Grafana Cloud MCP), imported and called in code.*

Everything else in this repo is the **deterministic engine** (TypeScript). This
service is the one Gemini-powered agent that sits on top of it, per design
decision **D2** ("agent vs deterministic service") — now applied to language and
hosting too (decision **D3**: Python where the ecosystem is strongest).

```
   Grafana Cloud MCP ── tools ──▶  ┌───────────────────────────┐
                                   │  radar_fixer (Gemini)     │  ← Agent Engine
   deterministic gates ─────────▶  │  LlmAgent, temp 0.2       │
     (radar_gates.py)              └─────────────┬─────────────┘
                                                 │ SCENELOCK_API_BASE (optional)
                                                 ▼
                                   TypeScript backend (services/api)
                                   ├ /findings/:fid/remediate  ← budget cap authority
                                   └ /scenes/:sid/certify       ← lock rule authority
```

## Two files, one rule each

| File | Deps | What |
|---|---|---|
| `radar_gates.py` | **stdlib only** | The two deterministic rules — loop budget cap (E.3/E.12) and lock rule (E.4 + G-02). One implementation, enforced in code. Optional `ApiBackend` defers to the TS API so there's a single cross-language authority. |
| `radar_agent.py` | `google-adk[mcp]`, `google-genai` | The Gemini `LlmAgent` + Grafana Cloud MCP toolset + safety settings. **Imports** the gates above — never re-declares them (spec D5: "the lock logic has one home"). |

## Run the self-tests (ground-truth discipline — raw PASS/FAIL, not opinions)

```bash
# Tier 1 — deterministic core. Zero deps, zero credentials, zero cost. Run first.
python radar_gates.py            # G1–G4 (+ C2PA/kill-switch extensions)

# Tier 2 — the live agent. Needs credentials (see .env.example).
pip install -r requirements.txt
python radar_agent.py            # G1–G6
```

`G1–G4` are pure-function gate tests. `G5` resolves the live Grafana MCP tools
(needs `GRAFANA_STACK_URL` + a one-time "Grafana Assistant" terms acceptance in
the Grafana Cloud UI; a bare run returns `401 Unauthorized`). `G6` runs one real
Gemini turn and asserts the agent chose the budget-gated tool (needs GCP ADC;
without it you get `No API key was provided`). **If G1–G4 pass but G5/G6 fail,
the core is fine and the problem is purely credentials — look there first.**

## Single source of truth (why the gates take a backend)

The budget cap and the lock rule already exist in TypeScript
(`services/verdict/computeVerdict`, `services/fixer` governor,
`services/certifier`). Two hand-kept copies of a safety rule drift. So:

- **offline / demo** — `SCENELOCK_API_BASE` unset → the in-process reference
  implementation in `radar_gates.py` decides. Deterministic, free, and what
  `G1–G4` verify.
- **production** — `SCENELOCK_API_BASE=http://…` set → the gates POST to the TS
  API, which owns the *one* implementation of each rule. The agent inherits the
  authority instead of re-deciding.

## What's still a stub (and the one line to replace)

| Stub | Replace with | Guard that does NOT change |
|---|---|---|
| `_call_veo()` in `radar_gates.py` | real Veo regeneration client | the budget cap around it |
| lock gate's `certificate_hash` line | real Cloud KMS sign | the lock-rule guards around it |

## Deploy

Agent on **Agent Engine** (managed ADK runtime, agent session state + scaling).
Deterministic services (media-processor, certifier's KMS call, public verifier)
stay on **Cloud Run**. For an unattended deployment, swap the hosted
`mcp.grafana.com` toolset for self-hosted `grafana/mcp-grafana` with a
service-account token (the hosted endpoint authenticates interactively — one
browser click — which is fine for a human-in-the-loop demo).
