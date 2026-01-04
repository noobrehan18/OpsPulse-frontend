import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
      // Note: WebSocket connections go directly to backend (ws://localhost:8001)
      // to avoid Vite proxy issues with high-throughput WebSocket streams,
  },
)
