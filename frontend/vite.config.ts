// vitest/config, not vite: the `test` block below is a Vitest extension of
// Vite's config type. It used to typecheck only because the test files were in
// the same program and pulled in Vitest's type augmentation as a side effect —
// excluding them from the build config removed it and broke `tsc`.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    globals: true
  },
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "leaflet", "react-leaflet", "zustand", "socket.io-client"],
        }
      }
    }
  }
});
