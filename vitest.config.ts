import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/main.ts"],
      thresholds: { lines: 90, functions: 90, branches: 85 },
    },
  },
});
