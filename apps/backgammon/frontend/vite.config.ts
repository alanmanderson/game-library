import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// When running inside Docker the backend service is reachable at "backend:8000".
// Outside Docker (local dev) it is at "localhost:8000".
const backendTarget = process.env.VITE_BACKEND_INTERNAL_URL || "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: backendTarget,
        changeOrigin: true,
      },
      "/ws": {
        target: backendTarget.replace(/^http/, "ws"),
        ws: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
  },
});
