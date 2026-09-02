import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const p = (x: string) => fileURLToPath(new URL(x, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@scenelock/schema": p("../../packages/schema/src/index.ts"),
      "@scenelock/rulepack": p("../../packages/rulepack/src/index.ts"),
    },
  },
  test: { include: ["src/**/*.test.ts"] },
});
