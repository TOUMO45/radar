/**
 * Grafana Cloud annotation seam (Step 0 Q3).
 *
 * The Python agent (services/agent/radar_agent.py) authenticates to Grafana
 * with a service-account token (`glsa_…`) via GRAFANA_URL +
 * GRAFANA_SERVICE_ACCOUNT_TOKEN, handed to the OSS `mcp-grafana` binary. A
 * Grafana SA token is an ordinary Grafana API credential and the MCP server
 * is only a wrapper over the same Grafana HTTP API — so the identical token
 * calls the plain Annotations API directly from this TypeScript service, no
 * MCP client, no Python. (Going via the agent's MCP would be strictly
 * harder: its tool filter has no annotations tool.)
 *
 * This is deliberately fire-and-forget and fail-open:
 *   - unset env  → no-op (local dev, CI, tests are completely unaffected)
 *   - network/HTTP error → swallowed; a feature request never fails because
 *     telemetry is down
 *   - a 3s timeout caps the added latency
 */

const GRAFANA_URL = (
  process.env.GRAFANA_URL ||
  process.env.GRAFANA_STACK_URL ||
  ""
).replace(/\/+$/, "");

const GRAFANA_TOKEN =
  process.env.GRAFANA_SA_TOKEN || process.env.GRAFANA_SERVICE_ACCOUNT_TOKEN || "";

export function grafanaConfigured(): boolean {
  return Boolean(GRAFANA_URL && GRAFANA_TOKEN);
}

/**
 * POST one annotation to Grafana Cloud's HTTP Annotations API. Resolves
 * whether or not the write succeeds — callers `await` it only so the write
 * is not lost when Cloud Run suspends the instance after the response.
 */
export async function annotate(text: string, tags: string[] = []): Promise<void> {
  if (!grafanaConfigured()) return;
  try {
    await fetch(`${GRAFANA_URL}/api/annotations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${GRAFANA_TOKEN}`,
      },
      body: JSON.stringify({
        text,
        tags: ["radar", ...tags],
        time: Date.now(),
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // fire-and-forget: telemetry must never break a product route
  }
}
