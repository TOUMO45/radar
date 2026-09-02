import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const p = (x: string) => fileURLToPath(new URL(x, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@scenelock/schema": p("../../packages/schema/src/index.ts"),
      "@scenelock/verdict": p("../verdict/src/index.ts"),
      "@scenelock/fixtures": p("../../packages/fixtures/src/index.ts"),
      "@scenelock/ports": p("../../packages/ports/src/index.ts"),
      "@scenelock/archivist": p("../archivist/src/index.ts"),
      "@scenelock/media-processor": p("../media-processor/src/index.ts"),
      "@scenelock/gate-clearance": p("../gate-clearance/src/index.ts"),
      "@scenelock/gate-compliance": p("../gate-compliance/src/index.ts"),
      "@scenelock/gate-continuity": p("../gate-continuity/src/index.ts"),
      "@scenelock/trust": p("../../packages/trust/src/index.ts"),
      "@scenelock/underwriting": p("../../packages/underwriting/src/index.ts"),
      "@scenelock/provenance": p("../provenance/src/index.ts"),
      "@scenelock/rulepack": p("../../packages/rulepack/src/index.ts"),
      "@scenelock/incidents": p("../incidents/src/index.ts"),
      "@scenelock/fixer": p("../fixer/src/index.ts"),
      "@scenelock/certifier": p("../certifier/src/index.ts"),
      "@scenelock/saboteur": p("../saboteur/src/index.ts"),
      "@scenelock/verifier": p("../verifier/src/app.ts"),
    },
  },
  test: { include: ["src/**/*.test.ts"] },
});
