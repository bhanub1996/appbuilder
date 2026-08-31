import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          monaco: ["@monaco-editor/react"],
        },
      },
    },
  },
  server: {
    port: 5173,
    // Local dev only. In production the Vercel rewrite sends /api to the
    // FastAPI service, so no CORS and no proxy are involved.
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
