# Radar — Cloud & Grafana setup (what you do to unblock the live build)

Radar's code runs fully **mocked/DRY_RUN** — nothing here blocks me from writing more
of it. What this unblocks is the **agent's two live self-tests** and eventual real
deployment:

| You set up | Fixes | Self-test |
|---|---|---|
| **Google Cloud + Vertex AI** | `G6: No API key was provided` | real Gemini turn |
| **Grafana Cloud** | `G5: 401 Unauthorized` from mcp.grafana.com | live partner MCP |

Do **Part A** and **Part B**. Everything in Part D is optional (the full production
backend) and can wait.

> **Secret hygiene — read once.** Put every key/token/password only in a local
> `.env` file (git-ignored). **Never paste a token, key, or password into chat.**
> You *may* tell me non-secret facts if you want (project id, region, your
> `https://<name>.grafana.net` URL) — but I don't need them and I never need secrets.

---

## Part A — Google Cloud (unblocks G6: real Gemini via Vertex AI)

This uses **Application Default Credentials**, not a raw API key — that's the
enterprise-correct path and exactly what makes `GOOGLE_GENAI_USE_VERTEXAI=TRUE` work.

**A1. Install the gcloud CLI.**
Windows: download the installer from `https://cloud.google.com/sdk/docs/install`
(run it, then reopen your terminal). Verify:
```bash
gcloud version
```

**A2. Log in (opens a browser).**
```bash
gcloud auth login
```

**A3. Create a project (or reuse one).** The id must be globally unique, lowercase:
```bash
gcloud projects create radar-hackathon --name="Radar"
gcloud config set project radar-hackathon
```

**A4. Link billing** (Vertex needs a billing account — the free trial credits are fine):
```bash
gcloud billing accounts list
gcloud billing projects link radar-hackathon --billing-account=XXXXXX-XXXXXX-XXXXXX
```

**A5. Enable the Vertex AI API** (covers Gemini + Agent Engine):
```bash
gcloud services enable aiplatform.googleapis.com
```

**A6. Set up Application Default Credentials for local runs** (opens a browser):
```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project radar-hackathon
```

**A7. Put these in `services/agent/.env`** (copy from `.env.example`):
```
GOOGLE_CLOUD_PROJECT=radar-hackathon
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_GENAI_USE_VERTEXAI=TRUE
```
`us-central1` serves `gemini-2.5-flash`. Nothing secret here — ADC lives in your
gcloud config, not in the file.

✅ **Done when:** `python services/agent/radar_agent.py` shows **G6 PASS**
(it makes one real, ~free Gemini call and confirms the agent chose the budget tool).

---

## Part B — Grafana Cloud (unblocks G5: the partner-track MCP)

There are two ways to give the agent Grafana tools. **Option 2 (self-hosted) is the
one I recommend** — it uses a service-account token (no interactive browser step, works
unattended, and is the token you'll want for the backend's Grafana Incidents/Loki
writes anyway).

**B1. Create a free Grafana Cloud account.**
Go to `https://grafana.com` → *Create free account*. It provisions a stack at
`https://<name>.grafana.net`. **That URL is your `GRAFANA_STACK_URL`.**

**B2. Create a service account + token.**
In your Grafana stack UI: **Administration → Users and access → Service accounts →
Add service account**. Name it `radar-agent`, role **Admin** (or, scoped tighter later:
Editor + Loki/Incident access). Then **Add service account token → Generate → copy it
once** (you can't see it again). Paste it into your local `.env`, nowhere else.

**B3a. Option 1 — hosted MCP (matches the code as shipped).**
Set `GRAFANA_STACK_URL` in `.env`. The hosted endpoint `mcp.grafana.com` authenticates
**interactively**: on first agent run it opens a browser to authorize, and a stack admin
must **accept the "Grafana Assistant" terms once** in the Grafana Cloud UI (that
acceptance is what the `401` is really about). Fine for a human-present demo.

**B3b. Option 2 — self-hosted MCP (recommended: token, no browser).**
Run Grafana's open-source MCP server locally with your service-account token:
```bash
docker run -p 8000:8000 \
  -e GRAFANA_URL=https://<name>.grafana.net \
  -e GRAFANA_SERVICE_ACCOUNT_TOKEN=<your-token> \
  mcp/grafana -t streamable-http
```
(Confirm the exact env/flag names against the `grafana/mcp-grafana` README — they get
renamed occasionally.) Then tell me you want Option 2 and I'll switch the agent's
`McpToolset` to point at `http://localhost:8000/mcp` — a two-line change, already
anticipated in the agent's docstring.

**B4. Put this in `services/agent/.env`:**
```
GRAFANA_STACK_URL=https://<name>.grafana.net
# token stays in your shell / docker env for Option 2 — not committed
```

✅ **Done when:** `python services/agent/radar_agent.py` shows **G5 PASS**
(it lists real Grafana MCP tool names).

---

## Part C — What to actually hand me

- **Nothing secret, ever.** Keys/tokens live only in your local `.env`.
- Optional non-secrets you can drop in chat if you'd like me to hard-wire defaults:
  your **region** (default `us-central1`) and whether you're using Grafana **Option 1
  or 2**. That's it.
- When G5/G6 are green on your machine, just tell me *"G5/G6 pass"* — I'll take that as
  the signal to wire `SCENELOCK_API_BASE` and move the agent from mock to live.

---

## Part D — Later: the full production backend (optional, when you're ready)

The TypeScript engine is mocked behind `packages/ports`. To run any of it for real,
enable these and I'll add the matching adapter (one at a time — Firestore first is the
highest-leverage):

```bash
gcloud services enable \
  firestore.googleapis.com \      # StoragePort → Firestore (E.7)
  pubsub.googleapis.com \         # EventBusPort → Pub/Sub (E.2)
  run.googleapis.com \            # deploy the deterministic services
  cloudkms.googleapis.com \       # certifier real signing (G-15)
  storage.googleapis.com          # evidence / references / certificates (E.7)
```
Deployment split (design D2): the **agent → Agent Engine** (managed ADK runtime); the
**deterministic services → Cloud Run**. Grafana dashboards/alerts ship as code later.

---

## Verify (run these yourself any time)

```bash
# tier 1 — always works, no credentials:
python services/agent/radar_gates.py     # G1–G4 PASS, exit 0

# tier 2 — after Parts A & B:
python services/agent/radar_agent.py      # G1–G6 all PASS
```
