import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@t3code-pets/core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url),
      ),
      "@t3code-pets/react": fileURLToPath(
        new URL("./packages/react/src/index.ts", import.meta.url),
      ),
      "@t3code-pets/t3": fileURLToPath(
        new URL("./packages/t3/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: [
      "packages/*/test/**/*.test.{ts,tsx}",
      "pets/*/test/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
});
