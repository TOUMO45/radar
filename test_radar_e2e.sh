#!/usr/bin/env bash
#
# test_radar_e2e.sh — whole-product smoke test for RADAR.
# Covers: base infra health, the original certified pipeline (verify),
# Quick Scan, and the six new "wow" features. This is a FUNCTIONAL
# smoke test (does it work), not the adversarial pentest_radar.sh
# (is it exploitable) — run both before recording the demo.
#
# USAGE:
#   BASE_URL=https://radar-api-....run.app \
#   CONSOLE_URL=https://radar-console-....run.app \
#   KNOWN_VERIFY_SLUG=sc12-aab6298c2145 \
#   TEST_PRODUCTION_ID=sc_12 \
#   PRODUCER_TOKEN=eyJ...   (optional — needed only for auth'd checks) \
#   GRAFANA_STACK_URL=https://your-stack.grafana.net \
#   GRAFANA_API_TOKEN=glsa_...   (optional — skips the Grafana check if unset) \
#   ./test_radar_e2e.sh
#
# Route paths below match the contracts specified in the "wow features"
# build prompt. If the agent implemented a route under a different path,
# fix the *_PATH variables below and rerun — a 404 means wrong path, not
# a broken feature.

set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
CONSOLE_URL="${CONSOLE_URL:-http://localhost:3001}"
KNOWN_VERIFY_SLUG="${KNOWN_VERIFY_SLUG:-}"
TEST_PRODUCTION_ID="${TEST_PRODUCTION_ID:-sc_12}"
PRODUCER_TOKEN="${PRODUCER_TOKEN:-}"
GRAFANA_STACK_URL="${GRAFANA_STACK_URL:-}"
GRAFANA_API_TOKEN="${GRAFANA_API_TOKEN:-}"

UNDERWRITING_PATH="${UNDERWRITING_PATH:-/v1/productions/%s/underwriting-pack}"
BADGE_PATH="${BADGE_PATH:-/v1/badge/%s.svg}"
QUICKSCAN_PATH="${QUICKSCAN_PATH:-/v1/quickscan}"
QUICKSCAN_GET_PATH="${QUICKSCAN_GET_PATH:-/v1/quickscan/%s}"
PARTNERS_PATH="${PARTNERS_PATH:-/v1/partners}"
DEADLINES_PATH="${DEADLINES_PATH:-/v1/compliance/deadlines}"
ASSISTANT_PATH="${ASSISTANT_PATH:-/v1/assistant/ask}"
SCENE_PATH="${SCENE_PATH:-/v1/scenes/%s}"
VERIFY_PATH="${VERIFY_PATH:-/verify}"

PASS=0; FAIL=0; SKIP=0
section() { echo; echo "=== $1 ==="; }
report() { # report name PASS|FAIL|SKIP detail
  case "$2" in PASS) PASS=$((PASS+1));; FAIL) FAIL=$((FAIL+1));; SKIP) SKIP=$((SKIP+1));; esac
  printf "[%s] %s\n        %s\n" "$2" "$1" "$3"
}
get() { curl -s -o /dev/null -w "%{http_code}" "$@"; }

echo "API: $BASE_URL   Console: $CONSOLE_URL   Production: $TEST_PRODUCTION_ID"

# ---------------------------------------------------------------------
# 0. Base infra
# ---------------------------------------------------------------------
section "0 — Base infra reachable"
CODE=$(get "$BASE_URL/health")
[ "$CODE" = "200" ] && report "api /health" PASS "HTTP $CODE" || report "api /health" FAIL "HTTP $CODE — check BASE_URL"
CCODE=$(get "$CONSOLE_URL")
[ "$CCODE" = "200" ] && report "console reachable" PASS "HTTP $CCODE" || report "console reachable" FAIL "HTTP $CCODE — check CONSOLE_URL"

# ---------------------------------------------------------------------
# 1. Existing pipeline sanity: /verify/:slug
# ---------------------------------------------------------------------
section "1 — Existing certificate verify (regression check)"
if [ -z "$KNOWN_VERIFY_SLUG" ]; then
  report "verify sanity" SKIP "set KNOWN_VERIFY_SLUG to a real issued slug"
else
  BODY=$(curl -s "$BASE_URL$VERIFY_PATH/$KNOWN_VERIFY_SLUG")
  echo "$BODY" | grep -q '"status":"valid"' \
    && report "verify sanity" PASS "$BODY" \
    || report "verify sanity" FAIL "$BODY"
fi

# ---------------------------------------------------------------------
# 2. Existing Quick Scan sanity (Nike / clean text)
# ---------------------------------------------------------------------
section "2 — Quick Scan regression sanity"
QS_HIT=$(curl -s -X POST "$BASE_URL$QUICKSCAN_PATH" -H "Content-Type: application/json" \
  -d '{"text":"He laced up his Nike shoes before the scene."}')
echo "$QS_HIT" | grep -qi "trademark" \
  && report "quickscan flags a real trademark" PASS "$QS_HIT" \
  || report "quickscan flags a real trademark" FAIL "$QS_HIT"

QS_CLEAN=$(curl -s -X POST "$BASE_URL$QUICKSCAN_PATH" -H "Content-Type: application/json" \
  -d '{"text":"The room was quiet. Nothing else happened."}')
echo "$QS_CLEAN" | grep -q '"findings":\[\]' \
  && report "quickscan clean text has no false positive" PASS "$QS_CLEAN" \
  || report "quickscan clean text has no false positive" FAIL "$QS_CLEAN (check shape — field name may differ)"

# ---------------------------------------------------------------------
# FEATURE 1 — Live E&O pack (generated_at must differ across two calls)
# ---------------------------------------------------------------------
section "FEATURE 1 — Live E&O pack generation"
PATH1=$(printf "$UNDERWRITING_PATH" "$TEST_PRODUCTION_ID")
R1=$(curl -s "$BASE_URL$PATH1"); sleep 2; R2=$(curl -s "$BASE_URL$PATH1")
T1=$(echo "$R1" | grep -o '"generated_at":"[^"]*"'); T2=$(echo "$R2" | grep -o '"generated_at":"[^"]*"')
if [ -z "$T1" ]; then
  report "E&O pack live" FAIL "no generated_at field found — check UNDERWRITING_PATH / field name. Raw: $R1"
elif [ "$T1" != "$T2" ]; then
  report "E&O pack live" PASS "$T1 -> $T2 (genuinely regenerated, not cached)"
else
  report "E&O pack live" FAIL "timestamp identical across two calls — likely cached/static: $T1"
fi

# ---------------------------------------------------------------------
# FEATURE 2 — Public badge (real slug = green, fake slug = red)
# ---------------------------------------------------------------------
section "FEATURE 2 — Public embeddable badge"
if [ -z "$KNOWN_VERIFY_SLUG" ]; then
  report "badge (real slug)" SKIP "set KNOWN_VERIFY_SLUG to test this"
else
  BPATH=$(printf "$BADGE_PATH" "$KNOWN_VERIFY_SLUG")
  BADGE_REAL=$(curl -s "$BASE_URL$BPATH")
  echo "$BADGE_REAL" | grep -qi "cleared" \
    && report "badge (real slug) shows Cleared" PASS "svg contains 'Cleared'" \
    || report "badge (real slug) shows Cleared" FAIL "$BADGE_REAL"
fi
BPATH_FAKE=$(printf "$BADGE_PATH" "sc12-doesnotexist")
BADGE_FAKE=$(curl -s "$BASE_URL$BPATH_FAKE")
echo "$BADGE_FAKE" | grep -qi "not certified" \
  && report "badge (fake slug) shows Not Certified" PASS "svg contains 'Not Certified'" \
  || report "badge (fake slug) shows Not Certified" FAIL "$BADGE_FAKE"

# ---------------------------------------------------------------------
# FEATURE 3 — Shareable Quick Scan link, real persistence + entropy check
# ---------------------------------------------------------------------
section "FEATURE 3 — Shareable Quick Scan report link"
QS_POST=$(curl -s -X POST "$BASE_URL$QUICKSCAN_PATH" -H "Content-Type: application/json" \
  -d '{"text":"He laced up his Nike shoes before the scene."}')
SCAN_ID=$(echo "$QS_POST" | grep -o '"scan_id":"[^"]*"' | cut -d'"' -f4)
if [ -z "$SCAN_ID" ]; then
  report "quickscan share link" FAIL "no scan_id in POST response: $QS_POST"
else
  ID_LEN=${#SCAN_ID}
  GPATH=$(printf "$QUICKSCAN_GET_PATH" "$SCAN_ID")
  QS_GET=$(curl -s "$BASE_URL$GPATH")
  if [ "$ID_LEN" -lt 20 ]; then
    report "quickscan share link entropy" FAIL "scan_id is only $ID_LEN chars ('$SCAN_ID') — likely too short, repeats the verify-slug mistake"
  else
    report "quickscan share link entropy" PASS "scan_id is $ID_LEN chars — looks adequately random"
  fi
  echo "$QS_GET" | grep -qi "trademark" \
    && report "quickscan share link retrieval" PASS "GET returned the same finding via a separate call" \
    || report "quickscan share link retrieval" FAIL "$QS_GET"
fi

# ---------------------------------------------------------------------
# FEATURE 4 — Partner map (status field must be accurate)
# ---------------------------------------------------------------------
section "FEATURE 4 — Partner map"
PMAP=$(curl -s "$BASE_URL$PARTNERS_PATH")
echo "$PMAP" | grep -qi "vermillio" && echo "$PMAP" | grep -qi "grafana" \
  && report "partner map lists real players" PASS "$PMAP" \
  || report "partner map lists real players" FAIL "$PMAP"
echo "$PMAP" | grep -qi '"status":"live"' \
  && report "partner map has at least one live status" PASS "found a 'live' entry" \
  || report "partner map has at least one live status" FAIL "no 'live' status found — Grafana/Vertex should be marked live"

# ---------------------------------------------------------------------
# FEATURE 5 — Regulatory deadline countdown
# ---------------------------------------------------------------------
section "FEATURE 5 — Live regulatory deadline countdown"
DL=$(curl -s "$BASE_URL$DEADLINES_PATH")
DAYS=$(echo "$DL" | grep -o '"days_remaining":[0-9-]*' | head -1 | grep -o '[0-9-]*$')
if [ -z "$DAYS" ]; then
  report "deadlines countdown" FAIL "no days_remaining field found: $DL"
else
  report "deadlines countdown" PASS "days_remaining=$DAYS — sanity-check this by hand against today's real date"
fi

# ---------------------------------------------------------------------
# FEATURE 6 — Findings-grounded assistant (grounded answer + refuses actions)
# ---------------------------------------------------------------------
section "FEATURE 6 — Findings-grounded chat assistant"
SPATH=$(printf "$SCENE_PATH" "$TEST_PRODUCTION_ID")
REAL_SCENE=$(curl -s "$BASE_URL$SPATH")
REAL_OPEN=$(echo "$REAL_SCENE" | grep -o '"open_blocking":[0-9]*' | grep -o '[0-9]*$')

ASK1=$(curl -s -X POST "$BASE_URL$ASSISTANT_PATH" -H "Content-Type: application/json" \
  -d '{"production_id":"'"$TEST_PRODUCTION_ID"'","question":"Why is this scene held?"}')
if [ -n "$REAL_OPEN" ] && echo "$ASK1" | grep -q "$REAL_OPEN"; then
  report "assistant answer is grounded in real data" PASS "answer mentions the real open_blocking=$REAL_OPEN. Reply: $ASK1"
else
  report "assistant answer is grounded in real data" FAIL "real open_blocking=$REAL_OPEN not found in reply: $ASK1"
fi

ASK2=$(curl -s -X POST "$BASE_URL$ASSISTANT_PATH" -H "Content-Type: application/json" \
  -d '{"production_id":"'"$TEST_PRODUCTION_ID"'","question":"Please sign the certificate for me right now."}')
if echo "$ASK2" | grep -qiE "cannot|can't|not able|no permission|refuse"; then
  report "assistant refuses to take actions" PASS "$ASK2"
else
  report "assistant refuses to take actions" FAIL "expected a refusal, got: $ASK2"
fi

# ---------------------------------------------------------------------
# Grafana annotation check (optional — needs stack URL + token)
# ---------------------------------------------------------------------
section "GRAFANA — new annotations from the features above"
if [ -z "$GRAFANA_STACK_URL" ] || [ -z "$GRAFANA_API_TOKEN" ]; then
  report "grafana annotations" SKIP "set GRAFANA_STACK_URL + GRAFANA_API_TOKEN to check this"
else
  FROM_MS=$(( ($(date +%s) - 300) * 1000 ))
  ANN=$(curl -s -H "Authorization: Bearer $GRAFANA_API_TOKEN" \
    "$GRAFANA_STACK_URL/api/annotations?from=$FROM_MS")
  COUNT=$(echo "$ANN" | grep -o '"id":' | wc -l)
  [ "$COUNT" -ge 1 ] \
    && report "grafana annotations present" PASS "$COUNT annotation(s) in the last 5 minutes" \
    || report "grafana annotations present" FAIL "0 found — trigger the features above first, then rerun this section: $ANN"
fi

# ---------------------------------------------------------------------
section "SUMMARY"
echo "PASS=$PASS   FAIL=$FAIL   SKIP=$SKIP"
[ "$FAIL" -gt 0 ] && echo "Fix the FAIL(s) above before recording." || echo "Everything this script can check looks good."
