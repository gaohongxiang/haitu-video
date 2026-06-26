import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist/console",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) {
            return "vendor-react";
          }
          if (id.includes("/echarts-for-react/")) {
            return "vendor-echarts-react";
          }
          if (id.includes("/zrender/")) {
            return "vendor-zrender";
          }
          if (id.includes("/echarts/lib/chart/line/") || id.includes("/echarts/lib/chart/line.js")) {
            return "vendor-echarts-line";
          }
          if (id.includes("/echarts/lib/chart/bar/") || id.includes("/echarts/lib/chart/bar.js")) {
            return "vendor-echarts-bar";
          }
          if (id.includes("/echarts/lib/chart/pie/") || id.includes("/echarts/lib/chart/pie.js")) {
            return "vendor-echarts-pie";
          }
          if (id.includes("/echarts/lib/chart/")) {
            return "vendor-echarts-chart-shared";
          }
          if (id.includes("/echarts/lib/component/")) {
            return "vendor-echarts-components";
          }
          if (id.includes("/echarts/")) {
            return "vendor-echarts-core";
          }
          if (id.includes("/lucide-react/") || id.includes("/lucide/")) {
            return "vendor-icons";
          }
          return "vendor";
        }
      }
    }
  },
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": "http://127.0.0.1:4173",
      "/media": "http://127.0.0.1:4173"
    }
  }
});
