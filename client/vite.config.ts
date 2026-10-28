import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// `vite --mode demo` runs the real engine in the browser with simulated
// members, so the UI can be developed and tested without a Root dev token.
export default defineConfig({
  // Root serves the client from its own path, so asset URLs must be relative.
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@studyroom/core": source("../core/src/index.ts"),
      "@studyroom/contract": source("../contract/src/index.ts"),
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
});
