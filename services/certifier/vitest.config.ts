import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const p = (x: string) => fileURLToPath(new URL(x, import.meta.url));
export default defineConfig({
  resolve: {
    alias: {
      "@scenelock/schema": p("../../packages/schema/src/index.ts"),
      "@scenelock/fixtures": p("../../packages/fixtures/src/index.ts"),
      "@scenelock/ports": p("../../packages/ports/src/index.ts"),
      "@scenelock/gate-music": p("../gate-music/src/index.ts"),
      "@scenelock/verdict": p("../verdict/src/index.ts"),
    },
  },
  test: { include: ["src/**/*.test.ts"] },
});
