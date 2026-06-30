import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 56520,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: ['pcm.aiconn.ai'],
    hmr: host ? { protocol: "ws", host, port: 5174 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
    proxy: {
      '/api': {
        target: 'http://localhost:56521',
        changeOrigin: true,
      },
      '/terminal': {
        target: 'ws://localhost:56521',
        ws: true,
      },
    },
  },
}));
