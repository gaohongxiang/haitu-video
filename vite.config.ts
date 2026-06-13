import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist/console",
    emptyOutDir: true
  },
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": "http://127.0.0.1:4173",
      "/media": "http://127.0.0.1:4173"
    }
  }
});
