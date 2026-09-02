# @scenelock/provenance — provenance verification (roadmap R2)

Turns *declared* provenance (`ShotProvenance.c2pa`, `watermark`) into **verified**
provenance. EU AI Act Art. 50(2) doesn't ask a shot to *claim* a machine-readable
mark — it asks for one that actually **verifies**. This package runs a real
verifier over the asset bytes and records the cryptographic result.

Behind the `ProvenancePort` seam (`@scenelock/ports`):

| Adapter | What it does | Needs |
|---|---|---|
| `C2paToolProvenanceAdapter` | Runs the **ContentAuth `c2patool`** over the asset; classifies manifest **integrity** (hashes/claim signature), **trust** (cert chains to an anchor), the **AI-generation signal** (IPTC `digitalSourceType`), and a **soft-binding watermark**. | the `c2patool` binary |
| `DryRunProvenanceAdapter` | Derives the result from the shot's declared `ShotProvenance` — the whole pipeline runs with no binary and no files. A declared value is reported *as declared*, never as independently verified. | nothing |

The deterministic core is `parseC2paReport()` — it maps a `c2patool` JSON report
to `C2paValidation`. It is fully unit-tested against **real captured tool output**
(`test-fixtures/signed-ai.c2patool.json`) and, when the binary is present, an
integration test runs the real tool over a **genuine C2PA-signed image**
(`test-fixtures/signed-ai.jpg`) and a plain image.

## The c2patool binary

Git-ignored (~29 MB). Download the official ContentAuth build and drop it in
`services/provenance/bin/` (auto-detected), or set `C2PATOOL_BIN`:

```bash
# macOS/Linux/Windows binaries: https://github.com/contentauth/c2pa-rs/releases
#   asset: c2patool-vX.Y.Z-<target>.zip  →  extract c2patool[.exe] into ./bin/
```

Without the binary, `DryRunProvenanceAdapter` is used and the live integration
test skips automatically (exactly like the agent's G5/G6 credentialed tiers).

## In the product

`POST /v1/shots/:id/verify-provenance { "asset_ref": "<path-or-uri>" }` runs the
verification and, when it ran against real bytes, folds the verified result back
onto the shot's provenance — so the Trust Score, Delivery Readiness and the E&O
Underwriting Pack reflect **proof**, not a claim.
