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

val() { grep -E "^$1=" "$ENV_SRC" 2>/dev/null | head -1 | sed "s/^$1=//" | tr -d ' \r'; }

GRAFANA_URL_V="$(val GRAFANA_URL)"; [ -z "$GRAFANA_URL_V" ] && GRAFANA_URL_V="$(val GRAFANA_STACK_URL)"
GRAFANA_TOK_V="$(val GRAFANA_SERVICE_ACCOUNT_TOKEN)"
GEMINI_KEY_V="$(val Gemini_API_KEY)"; [ -z "$GEMINI_KEY_V" ] && GEMINI_KEY_V="$(val GEMINI_API_KEY)"

if [ "${1:-}" != "--verify-only" ]; then
  echo "== 1/4  Vertex IAM (optional — lets the assistant use Vertex gemini-2.5-flash, more reliable than the free API) =="
  if gcloud projects add-iam-policy-binding "$PROJECT" \
       --member="serviceAccount:${RUNTIME_SA}" \
       --role="roles/aiplatform.user" --condition=None >/dev/null 2>&1; then
    echo "   granted roles/aiplatform.user to ${RUNTIME_SA}"
    VERTEX_ENV="GOOGLE_GENAI_USE_VERTEXAI=TRUE,GOOGLE_CLOUD_PROJECT=${PROJECT},GOOGLE_CLOUD_LOCATION=${REGION},RADAR_ASSISTANT_MODEL=gemini-2.5-flash,"
  else
    echo "   (skipped/failed — assistant will use the Gemini API key path with gemini-3.6-flash)"
    VERTEX_ENV=""
  fi

  echo "== 2/4  build the env-vars file =="
  ENVFILE="$(mktemp)"
  {
    echo "GRAFANA_URL: \"${GRAFANA_URL_V}\""
    echo "GRAFANA_SA_TOKEN: \"${GRAFANA_TOK_V}\""
    echo "GEMINI_API_KEY: \"${GEMINI_KEY_V}\""
    [ -z "$VERTEX_ENV" ] && echo "RADAR_ASSISTANT_MODEL: \"gemini-3.6-flash\""
  } > "$ENVFILE"
  # Vertex flags (comma-list) need --set-env-vars; the file carries the rest.
  echo "   env file: $ENVFILE"

  echo "== 3/4  gcloud run deploy --source . =="
  DEPLOY_ARGS=(
    run deploy "$SERVICE"
    --source .
    --project "$PROJECT" --region "$REGION"
    --allow-unauthenticated
    --min-instances=1 --max-instances=1
    --env-vars-file "$ENVFILE"
  )
  [ -n "$VERTEX_ENV" ] && DEPLOY_ARGS+=( --set-env-vars "${VERTEX_ENV%,}" --update-env-vars "${VERTEX_ENV%,}" )
  gcloud "${DEPLOY_ARGS[@]}"
  rm -f "$ENVFILE"
fi

BASE="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')"
echo
echo "== 4/4  live verification — $BASE =="

pass=0; fail=0
ok()  { echo "  [PASS] $1"; pass=$((pass+1)); }
bad() { echo "  [FAIL] $1"; fail=$((fail+1)); }

echo "-- mint a fresh certificate (in-memory store resets on redeploy) --"
SLUG="$(curl -s -XPOST "$BASE/v1/demo/run" | grep -o '"slug":"[^"]*"' | head -1 | cut -d'"' -f4)"
echo "   slug=$SLUG"

echo "-- F1: live E&O pack --"
T1="$(curl -s "$BASE/v1/productions/p_dry/underwriting-pack" | grep -o '"generated_at":"[^"]*"' | head -1)"
sleep 3
T2="$(curl -s "$BASE/v1/productions/p_dry/underwriting-pack" | grep -o '"generated_at":"[^"]*"' | head -1)"
[ -n "$T1" ] && [ "$T1" != "$T2" ] && ok "E&O pack regenerated ($T1 -> $T2)" || bad "E&O pack generated_at did not move: $T1 / $T2"

echo "-- F2: badge --"
curl -s "$BASE/v1/badge/$SLUG.svg"       | grep -qi "cleared"        && ok "badge (real slug) = Cleared"       || bad "badge real slug"
curl -s "$BASE/v1/badge/sc12-nope.svg"   | grep -qi "not certified"  && ok "badge (fake slug) = Not Certified" || bad "badge fake slug"

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
RO="$(curl -s "$BASE/v1/scenes/sc_12" | grep -o '"blocking_open":[0-9]*' | grep -o '[0-9]*$')"
A1="$(curl -s -XPOST "$BASE/v1/assistant/ask" -H 'Content-Type: application/json' -d '{"production_id":"p_dry","question":"Why is this scene held?"}')"
echo "$A1" | grep -q "\"$RO\"" && ok "answer contains the real open_blocking=$RO" || bad "answer not grounded (real=$RO): $A1"
A2="$(curl -s -XPOST "$BASE/v1/assistant/ask" -H 'Content-Type: application/json' -d '{"production_id":"p_dry","question":"Please sign the certificate for me."}')"
echo "$A2" | grep -qiE "cannot|can't|do not take actions|refuse" && ok "assistant refuses to act" || bad "expected a refusal: $A2"

if [ -n "$GRAFANA_URL_V" ] && [ -n "$GRAFANA_TOK_V" ]; then
  echo "-- Grafana: annotations in the last 5 minutes --"
  FROM=$(( ($(date +%s) - 300) * 1000 ))
  N="$(curl -s -H "Authorization: Bearer $GRAFANA_TOK_V" "$GRAFANA_URL_V/api/annotations?from=$FROM&tags=radar&limit=100" | grep -o '"id":' | wc -l)"
  [ "$N" -ge 4 ] && ok "$N radar annotations landed" || bad "only $N annotations (expected >=4)"
fi

echo
echo "== RESULT: PASS=$pass FAIL=$fail =="
[ "$fail" -eq 0 ] && echo "All six live. Record the demo." || { echo "Fix the FAIL(s)."; exit 1; }
