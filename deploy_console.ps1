# deploy_console.ps1 — deploy the "cinematic Control Room" UI pass to
# radar-console on Cloud Run.
#
# apps/console bakes SCENELOCK_API_BASE in at BUILD time (next.config.mjs's
# `env` block), so this can't be a plain `gcloud run deploy --source .` (that
# would use the repo-root Dockerfile, built for @scenelock/api, and couldn't
# pass a build arg anyway). It has to go through Cloud Build with
# cloudbuild.console.yaml, then a separate `gcloud run deploy --image`.
#
#   .\deploy_console.ps1                                 # points at the live radar-api
#   .\deploy_console.ps1 -ApiBase http://localhost:4000   # point at a different API

param(
  [string]$Project = "hakim-55f02",
  [string]$Region  = "us-central1",
  [string]$Service = "radar-console",
  [string]$ApiBase = "https://radar-api-qf2l7fjeqa-uc.a.run.app"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$acct = (gcloud config get-value account 2>$null)
if (-not $acct) { Write-Error "gcloud has no active account. Run: gcloud auth login" }
Write-Host "account: $acct   project: $Project   region: $Region   api: $ApiBase"

$Image = "us-central1-docker.pkg.dev/$Project/cloud-run-source-deploy/${Service}:$(Get-Date -Format yyyyMMddHHmmss)"

Write-Host "`n== 1/2  Cloud Build (Dockerfile.console, SCENELOCK_API_BASE baked in) =="
gcloud builds submit . `
  --project $Project `
  --config cloudbuild.console.yaml `
  --substitutions "_IMAGE=$Image,_API_BASE=$ApiBase"

Write-Host "`n== 2/2  gcloud run deploy --image =="
gcloud run deploy $Service `
  --image $Image `
  --project $Project --region $Region `
  --allow-unauthenticated `
  --quiet

$url = (gcloud run services describe $Service --project $Project --region $Region --format="value(status.url)")
Write-Host "`nLive: $url"
Write-Host "Opening a few screens to eyeball the new design..."
try {
  $home = Invoke-WebRequest -UseBasicParsing -Uri $url
  if ($home.StatusCode -eq 200) { Write-Host "  [PASS] $url -> 200" } else { Write-Host "  [FAIL] $url -> $($home.StatusCode)" }
} catch {
  Write-Host "  [FAIL] $url unreachable: $($_.Exception.Message)"
}
Write-Host "Open it yourself: $url  (and $url/quickscan, $url/verify/<a-real-slug>)"
