import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// v158: Tauri v2 CLI 只设置 TAURI_ENV_*（TAURI_PLATFORM / TAURI_DEBUG 是 v1 的名字，v2 永远读不到）。
// TAURI_ENV_DEBUG 只在 `tauri dev` / `tauri build --debug` 时为 "true"。
const tauriPlatform = process.env.TAURI_ENV_PLATFORM;
const tauriDebug = process.env.TAURI_ENV_DEBUG === 'true';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**']
    }
  },
  // 只暴露 TAURI_ENV_*，避免 TAURI_SIGNING_PRIVATE_KEY 之类的 TAURI_ 变量进入前端产物。
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: tauriPlatform === 'windows' ? 'chrome105' : 'es2020',
    minify: !tauriDebug,
    sourcemap: tauriDebug,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        edgeStrip: resolve(__dirname, 'edge-strip.html')
      }
    }
  }
});
