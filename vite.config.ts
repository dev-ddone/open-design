import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [preact(), tailwindcss()],
  build: { outDir: "dist", sourcemap: true },
  resolve: {
    alias: {
      react: "preact/compat",
      "react-dom": "preact/compat",
      "react/jsx-runtime": "preact/jsx-runtime",
      "react-dom/test-utils": "preact/test-utils",
    },
  },
  server: {
    port: 5178,
    proxy: {
      "/api/collaboration": {
        target: "ws://localhost:3006",
        ws: true,
      },
      "/api": "http://localhost:3006",
      "/health": "http://localhost:3006",
    },
  },
});
