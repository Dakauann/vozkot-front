import { defineConfig } from "vitest/config";
import path from "node:path";
import react from "@vitejs/plugin-react";

/**
 * The test runner needs the same "@/" alias the app and tsconfig use; without
 * it every import that is not relative fails to resolve and the suite reports
 * a missing package rather than a failing assertion.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
