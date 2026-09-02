import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const p = (x: string) => fileURLToPath(new URL(x, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@scenelock/schema": p("../schema/src/index.ts"),
    },
  },
  test: { include: ["src/**/*.test.ts"] },
});
