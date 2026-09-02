import { buildMcp } from "./app.js";

const PORT = Number(process.env.MCP_PORT ?? 4100);
const HOST = process.env.HOST ?? "0.0.0.0";

buildMcp()
  .listen({ port: PORT, host: HOST })
  .then(() => {
    // eslint-disable-next-line no-console
    console.log(`[@scenelock/mcp] JSON-RPC on http://localhost:${PORT}/mcp`);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
