import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import os from 'node:os'

// 避開 OneDrive 鎖定：把 Vite 預建快取放到本機 AppData
const cacheDir = path.join(os.homedir(), 'AppData', 'Local', 'vite-cache-nasa2026')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  cacheDir,
  optimizeDeps: {
    include: [
      'three',
      '@react-three/fiber',
      '@react-three/drei',
      'react',
      'react-dom',
      'react-dom/client',
    ],
    holdUntilCrawlEnd: false,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
