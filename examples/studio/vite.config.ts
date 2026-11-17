import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development, API calls go to server.mjs (npm run server) on port 8787.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
});
