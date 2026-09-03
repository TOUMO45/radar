import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const p = (x: string) => fileURLToPath(new URL(x, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@scenelock/schema": p("../../packages/schema/src/index.ts"),
      "@scenelock/ports": p("../../packages/ports/src/index.ts"),
      "@scenelock/gate-clearance": p("../gate-clearance/src/index.ts"),
      "@scenelock/gate-compliance": p("../gate-compliance/src/index.ts"),
      "@scenelock/provenance": p("../provenance/src/index.ts"),
    },
  },
  test: { include: ["src/**/*.test.ts"] },
});
