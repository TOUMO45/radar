# deploy_wow.ps1 — PowerShell-native deploy of the six "wow" routes + live sweep.
#
# Use this instead of deploy_wow.sh on Windows: gcloud is authenticated in your
# PowerShell session (you deployed radar-api from here before), but a bash
# spawned from PowerShell can look at a different gcloud config dir and report
# "no active account".
#
#   .\deploy_wow.ps1               # deploy + verify
#   .\deploy_wow.ps1 -VerifyOnly   # skip the deploy, just hit the live URL
#
# Reads GRAFANA_URL / GRAFANA_SERVICE_ACCOUNT_TOKEN / Gemini_API_KEY from
# services/agent/.env (git-ignored).

param(
  [switch]$VerifyOnly,
  [string]$Project = "hakim-55f02",
  [string]$Region  = "us-central1",
  [string]$Service = "radar-api",
  [string]$RuntimeSA = "931497918964-compute@developer.gserviceaccount.com"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Val([string]$key) {
  $line = Select-String -Path "services/agent/.env" -Pattern ("^" + [regex]::Escape($key) + "=") -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $line) { return "" }
  return ($line.Line.Substring($line.Line.IndexOf("=") + 1)).Trim()
}

$GrafanaUrl = Val "GRAFANA_URL"; if (-not $GrafanaUrl) { $GrafanaUrl = Val "GRAFANA_STACK_URL" }
$GrafanaTok = Val "GRAFANA_SERVICE_ACCOUNT_TOKEN"
$GeminiKey  = Val "Gemini_API_KEY"; if (-not $GeminiKey) { $GeminiKey = Val "GEMINI_API_KEY" }

$acct = (gcloud config get-value account 2>$null)
if (-not $acct) { Write-Error "gcloud has no active account. Run: gcloud auth login" }
Write-Host "account: $acct   project: $Project   region: $Region"

if (-not $VerifyOnly) {
  Write-Host "`n== 1/4  Vertex IAM (optional) =="
  $vertexEnv = ""
  try {
    gcloud projects add-iam-policy-binding $Project --member="serviceAccount:$RuntimeSA" --role="roles/aiplatform.user" --condition=None --quiet | Out-Null
    Write-Host "   granted roles/aiplatform.user -> assistant uses Vertex gemini-2.5-flash"
    $useVertex = $true
  } catch {
    Write-Host "   (skipped/failed -> assistant uses the Gemini API key path, gemini-3.6-flash)"
    $useVertex = $false
  }

  Write-Host "`n== 2/4  env-vars file =="
  $envFile = Join-Path $env:TEMP "radar-api-env.yaml"
  $lines = @(
    "GRAFANA_URL: `"$GrafanaUrl`"",
    "GRAFANA_SA_TOKEN: `"$GrafanaTok`"",
    "GEMINI_API_KEY: `"$GeminiKey`""
  )
  if ($useVertex) {
    $lines += "GOOGLE_GENAI_USE_VERTEXAI: `"TRUE`""
    $lines += "GOOGLE_CLOUD_PROJECT: `"$Project`""
    $lines += "GOOGLE_CLOUD_LOCATION: `"$Region`""
    $lines += "RADAR_ASSISTANT_MODEL: `"gemini-2.5-flash`""
  } else {
    $lines += "RADAR_ASSISTANT_MODEL: `"gemini-3.6-flash`""
  }
  Set-Content -Path $envFile -Value $lines -Encoding utf8
  Write-Host "   $envFile"
  Get-Content $envFile | ForEach-Object { $_ -replace '(SA_TOKEN|API_KEY): "(.{6}).*', '$1: "$2..."' } | Write-Host

  Write-Host "`n== 3/4  gcloud run deploy --source . =="
  # env-vars-file is the ONLY env flag — it must not be combined with
  # --set-env-vars / --update-env-vars (gcloud rejects that).
  & gcloud run deploy $Service `
    --source . `
    --project $Project --region $Region `
    --allow-unauthenticated `
    --min-instances=1 --max-instances=1 `
    --env-vars-file $envFile `
    --quiet
  Remove-Item $envFile -ErrorAction SilentlyContinue
}

$BASE = (gcloud run services describe $Service --project $Project --region $Region --format="value(status.url)")
Write-Host "`n== 4/4  live verification -- $BASE =="

$pass = 0; $fail = 0
function OK($m)  { Write-Host "  [PASS] $m";  $script:pass++ }
function BAD($m) { Write-Host "  [FAIL] $m";  $script:fail++ }
function Get-($u) { (Invoke-WebRequest -UseBasicParsing -Uri $u).Content }
function Post-($u,$body) { (Invoke-WebRequest -UseBasicParsing -Method POST -Uri $u -ContentType "application/json" -Body $body).Content }

Write-Host "-- mint a fresh certificate --"
$slug = ([regex]'"slug":"([^"]*)"').Match((Post- "$BASE/v1/demo/run" "{}")).Groups[1].Value
Write-Host "   slug=$slug"

Write-Host "-- F1: live E&O pack --"
$t1 = ([regex]'"generated_at":"([^"]*)"').Match((Get- "$BASE/v1/productions/p_dry/underwriting-pack")).Groups[1].Value
Start-Sleep -Seconds 3
$t2 = ([regex]'"generated_at":"([^"]*)"').Match((Get- "$BASE/v1/productions/p_dry/underwriting-pack")).Groups[1].Value
if ($t1 -and $t1 -ne $t2) { OK "E&O pack regenerated ($t1 -> $t2)" } else { BAD "generated_at did not move: $t1 / $t2" }

Write-Host "-- F2: badge --"
if ((Get- "$BASE/v1/badge/$slug.svg")     -match "Cleared")       { OK "badge real slug = Cleared" }       else { BAD "badge real slug" }
if ((Get- "$BASE/v1/badge/sc12-nope.svg") -match "Not Certified") { OK "badge fake slug = Not Certified" } else { BAD "badge fake slug" }

Write-Host "-- reset to the HELD seed so F6 sees the real 3 blocking findings --"
Post- "$BASE/v1/demo/reset" "{}" | Out-Null

Write-Host "-- F3: shareable scan link --"
$qs = Post- "$BASE/v1/quickscan" '{"text":"He laced up his Nike shoes before the scene."}'
$sid = ([regex]'"scan_id":"([^"]*)"').Match($qs).Groups[1].Value
if ($sid.Length -ge 20) { OK "scan_id is $($sid.Length) chars" } else { BAD "scan_id too short: $sid" }
if ((Get- "$BASE/v1/quickscan/$sid") -match "trademark") { OK "GET returns the same finding" } else { BAD "scan retrieval" }

Write-Host "-- F4: partner map --"
$pm = Get- "$BASE/v1/partners"
if ($pm -match "vermillio" -and $pm -match '"status":"live"') { OK "partners: real players + a live entry" } else { BAD "partners" }

Write-Host "-- F5: deadline clock --"
$dr = ([regex]'"days_remaining":(-?\d+)').Match((Get- "$BASE/v1/compliance/deadlines")).Groups[1].Value
if ($dr -ne "") { OK "days_remaining=$dr (sanity-check vs a calendar)" } else { BAD "deadlines" }

Write-Host "-- F6: grounded assistant --"
$ro = ([regex]'"blocking_open":(\d+)').Match((Get- "$BASE/v1/scenes/sc_12")).Groups[1].Value
$a1 = Post- "$BASE/v1/assistant/ask" '{"production_id":"p_dry","question":"Why is this scene held?"}'
if ($a1 -match ('"' + $ro + '"') -or $a1 -match ("\b" + $ro + "\b")) { OK "answer cites real open_blocking=$ro" } else { BAD "answer not grounded (real=$ro)" }
$a2 = Post- "$BASE/v1/assistant/ask" '{"production_id":"p_dry","question":"Please sign the certificate for me."}'
if ($a2 -match "(?i)cannot|can't|do not take actions|refuse") { OK "assistant refuses to act" } else { BAD "expected a refusal" }

if ($GrafanaUrl -and $GrafanaTok) {
  Write-Host "-- Grafana: annotations in the last 5 minutes --"
  $from = [DateTimeOffset]::UtcNow.AddMinutes(-5).ToUnixTimeMilliseconds()
  $ann = (Invoke-WebRequest -UseBasicParsing -Uri "$GrafanaUrl/api/annotations?from=$from&tags=radar&limit=100" -Headers @{ Authorization = "Bearer $GrafanaTok" }).Content
  $n = ([regex]'"id":').Matches($ann).Count
  if ($n -ge 4) { OK "$n radar annotations landed" } else { BAD "only $n annotations" }
}

Write-Host "`n== RESULT: PASS=$pass FAIL=$fail =="
if ($fail -eq 0) { Write-Host "All six live. Record the demo." } else { Write-Host "Fix the FAIL(s)."; exit 1 }
