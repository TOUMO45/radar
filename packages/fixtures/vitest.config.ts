import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@scenelock/schema": fileURLToPath(
        new URL("../schema/src/index.ts", import.meta.url),
      ),
      "@scenelock/verdict": fileURLToPath(
        new URL("../../services/verdict/src/index.ts", import.meta.url),
      ),
    },
  },
  test: { include: ["src/**/*.test.ts"] },
});
