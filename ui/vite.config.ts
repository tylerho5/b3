import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 6767,
    proxy: {
      "/api": "http://127.0.0.1:4477",
      "/ws": { target: "ws://127.0.0.1:4477", ws: true },
    },
  },
});
