#!/usr/bin/env bash
#
# deploy_wow.sh — one-shot: deploy the six "wow" routes to Cloud Run, then
# prove all six + the Grafana wiring on the LIVE URL.
#
# Why this is a script you run and not something the build agent ran: this
# repo's build session had `gcloud run deploy` / IAM / Secret Manager blocked
# by a command classifier. Everything else (code, 256 tests, local curl proof
# of all six features + Grafana) was done and committed. This is the last mile.
#
#   bash deploy_wow.sh                # deploy + verify
#   bash deploy_wow.sh --verify-only  # skip the deploy, just hit the live URL
#
# Reads GRAFANA_URL / GRAFANA_SERVICE_ACCOUNT_TOKEN / Gemini_API_KEY from
# services/agent/.env (git-ignored). Override PROJECT / REGION / SERVICE below.

set -euo pipefail

PROJECT="${PROJECT:-hakim-55f02}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-radar-api}"
RUNTIME_SA="${RUNTIME_SA:-931497918964-compute@developer.gserviceaccount.com}"
ENV_SRC="services/agent/.env"

here() { cd "$(dirname "$0")"; }
here

# Windows + Git Bash: a bash spawned from PowerShell can point gcloud at a
# different config dir and report "no active account". Reuse the standard
# Windows gcloud config (where `gcloud auth login` in PowerShell wrote its
# creds) unless the caller set CLOUDSDK_CONFIG explicitly.
if [ -z "${CLOUDSDK_CONFIG:-}" ] && [ -n "${APPDATA:-}" ] && [ -d "${APPDATA}/gcloud" ]; then
  export CLOUDSDK_CONFIG="${APPDATA}/gcloud"
fi
ACCOUNT="${ACCOUNT:-$(gcloud config get-value account 2>/dev/null || true)}"
GA=()
[ -n "$ACCOUNT" ] && GA=(--account "$ACCOUNT")
if [ -z "$ACCOUNT" ]; then
  echo "!! gcloud has no active account visible to this shell." >&2
  echo "   Fix: run this from PowerShell instead —  .\\deploy_wow.ps1" >&2
  echo "   or:  export CLOUDSDK_CONFIG=\"\$APPDATA/gcloud\"  then re-run." >&2
  exit 1
fi
echo "account: $ACCOUNT   project: $PROJECT   region: $REGION"

val() { grep -E "^$1=" "$ENV_SRC" 2>/dev/null | head -1 | sed "s/^$1=//" | tr -d ' \r'; }

GRAFANA_URL_V="$(val GRAFANA_URL)"; [ -z "$GRAFANA_URL_V" ] && GRAFANA_URL_V="$(val GRAFANA_STACK_URL)"
GRAFANA_TOK_V="$(val GRAFANA_SERVICE_ACCOUNT_TOKEN)"
GEMINI_KEY_V="$(val Gemini_API_KEY)"; [ -z "$GEMINI_KEY_V" ] && GEMINI_KEY_V="$(val GEMINI_API_KEY)"

if [ "${1:-}" != "--verify-only" ]; then
  echo "== 1/4  Vertex IAM (roles/aiplatform.user on the runtime SA — idempotent) =="
  USE_VERTEX=0
  if gcloud "${GA[@]}" projects add-iam-policy-binding "$PROJECT" \
       --member="serviceAccount:${RUNTIME_SA}" \
       --role="roles/aiplatform.user" --condition=None >/dev/null 2>&1; then
    echo "   roles/aiplatform.user confirmed on ${RUNTIME_SA}"
    USE_VERTEX=1
  else
    echo "   (grant failed — assistant will use the Gemini API key path with gemini-3.6-flash)"
  fi

  echo "== 2/4  build the env-vars file =="
  ENVFILE="$(mktemp)"
  {
    echo "GRAFANA_URL: \"${GRAFANA_URL_V}\""
    echo "GRAFANA_SA_TOKEN: \"${GRAFANA_TOK_V}\""
    if [ "$USE_VERTEX" = "1" ]; then
      # Vertex is the default path now (2026-09-05) — GEMINI_API_KEY is
      # deliberately OMITTED, not just deprioritized, so there is no silent
      # fallback to the free-tier key masking a real Vertex problem.
      echo "GOOGLE_GENAI_USE_VERTEXAI: \"TRUE\""
      echo "GOOGLE_CLOUD_PROJECT: \"${PROJECT}\""
      echo "GOOGLE_CLOUD_LOCATION: \"${REGION}\""
      echo "RADAR_ASSISTANT_MODEL: \"gemini-2.5-flash\""
    else
      echo "GEMINI_API_KEY: \"${GEMINI_KEY_V}\""
      echo "RADAR_ASSISTANT_MODEL: \"gemini-3.6-flash\""
    fi
  } > "$ENVFILE"
  echo "   env file: $ENVFILE"
  cat "$ENVFILE" | sed -E 's/(SA_TOKEN|API_KEY): "(.{6}).*/\1: "\2.../'

  echo "== 3/4  gcloud run deploy --source . =="
  gcloud "${GA[@]}" run deploy "$SERVICE" \
    --source . \
    --project "$PROJECT" --region "$REGION" \
    --allow-unauthenticated \
    --min-instances=1 --max-instances=1 \
    --env-vars-file "$ENVFILE" \
    --quiet
  rm -f "$ENVFILE"
fi

BASE="$(gcloud "${GA[@]}" run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')"
echo
echo "== 4/4  live verification — $BASE =="

pass=0; fail=0
ok()  { echo "  [PASS] $1"; pass=$((pass+1)); }
bad() { echo "  [FAIL] $1"; fail=$((fail+1)); }
# Cloud Run's front end rejects a bodyless POST (411); always send one.
jpost() {
  local body="${2-}"
  [ -z "$body" ] && body='{}'
  curl -s -m 60 -XPOST "$1" -H 'Content-Type: application/json' -d "$body"
}

echo "-- mint a fresh certificate (in-memory store resets on redeploy) --"
SLUG="$(jpost "$BASE/v1/demo/run" | grep -o '"slug":"[^"]*"' | head -1 | cut -d'"' -f4)"
echo "   slug=$SLUG"

echo "-- F1: live E&O pack (gated 2026-09-05 — producer/legal/sre_admin only) --"
PRODUCER_AUTH="Authorization: Bearer ${RADAR_ROLE_TOKEN_PRODUCER:-radar_dev_producer_9f2a7c1e}"
T1="$(curl -s -m 30 -H "$PRODUCER_AUTH" "$BASE/v1/productions/p_dry/underwriting-pack" | grep -o '"generated_at":"[^"]*"' | head -1)"
sleep 3
T2="$(curl -s -m 30 -H "$PRODUCER_AUTH" "$BASE/v1/productions/sc_12/underwriting-pack" | grep -o '"generated_at":"[^"]*"' | head -1)"
[ -n "$T1" ] && [ "$T1" != "$T2" ] && ok "E&O pack regenerated ($T1 -> $T2)" || bad "E&O pack generated_at did not move: $T1 / $T2"
NOAUTH_CODE="$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$BASE/v1/productions/p_dry/underwriting-pack")"
[ "$NOAUTH_CODE" = "401" ] && ok "E&O pack rejects no-token request (401)" || bad "E&O pack should 401 with no token, got $NOAUTH_CODE"

echo "-- F2: badge --"
curl -s -m 20 "$BASE/v1/badge/$SLUG.svg"       | grep -qi "cleared"        && ok "badge (real slug) = Cleared"       || bad "badge real slug"
curl -s -m 20 "$BASE/v1/badge/sc12-nope.svg"   | grep -qi "not certified"  && ok "badge (fake slug) = Not Certified" || bad "badge fake slug"

echo "-- reset to the HELD seed so F6 sees the real 3 blocking findings --"
jpost "$BASE/v1/demo/reset" >/dev/null

echo "-- F3: shareable scan link --"
QS="$(curl -s -XPOST "$BASE/v1/quickscan" -H 'Content-Type: application/json' -d '{"text":"He laced up his Nike shoes before the scene."}')"
SID="$(echo "$QS" | grep -o '"scan_id":"[^"]*"' | cut -d'"' -f4)"
[ "${#SID}" -ge 20 ] && ok "scan_id is ${#SID} chars" || bad "scan_id too short: $SID"
curl -s "$BASE/v1/quickscan/$SID" | grep -qi "trademark" && ok "GET /v1/quickscan/:id returns the same finding" || bad "scan retrieval"

echo "-- F4: partner map --"
PM="$(curl -s "$BASE/v1/partners")"
echo "$PM" | grep -qi "vermillio" && echo "$PM" | grep -q '"status":"live"' && ok "partners: real players + a live entry" || bad "partners"

echo "-- F5: deadline clock --"
DR="$(curl -s "$BASE/v1/compliance/deadlines" | grep -o '"days_remaining":-\?[0-9]*' | head -1)"
[ -n "$DR" ] && ok "deadlines: $DR (sanity-check against a calendar)" || bad "deadlines"

echo "-- F6: grounded assistant --"
RO="$(curl -s -m 20 "$BASE/v1/scenes/sc_12" | grep -o '"blocking_open":[0-9]*' | grep -o '[0-9]*$')"
A1="$(jpost "$BASE/v1/assistant/ask" '{"production_id":"p_dry","question":"Why is this scene held?"}')"
echo "$A1" | grep -qE "([^0-9]|^)$RO([^0-9]|$)" && ok "answer cites the real open_blocking=$RO" || bad "answer not grounded (real=$RO): $(echo "$A1" | head -c 200)"
A2="$(jpost "$BASE/v1/assistant/ask" '{"production_id":"p_dry","question":"Please sign the certificate for me right now."}')"
echo "$A2" | grep -qiE "cannot|can't|do not take actions|refuse" && ok "assistant refuses to act" || bad "expected a refusal: $(echo "$A2" | head -c 200)"

if [ -n "$GRAFANA_URL_V" ] && [ -n "$GRAFANA_TOK_V" ]; then
  echo "-- Grafana: annotations in the last 5 minutes --"
  FROM=$(( ($(date +%s) - 300) * 1000 ))
  N="$(curl -s -H "Authorization: Bearer $GRAFANA_TOK_V" "$GRAFANA_URL_V/api/annotations?from=$FROM&tags=radar&limit=100" | grep -o '"id":' | wc -l)"
  [ "$N" -ge 4 ] && ok "$N radar annotations landed" || bad "only $N annotations (expected >=4)"
fi

echo
echo "== RESULT: PASS=$pass FAIL=$fail =="
[ "$fail" -eq 0 ] && echo "All six live. Record the demo." || { echo "Fix the FAIL(s)."; exit 1; }
