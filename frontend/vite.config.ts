import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only proxy so a single tunnel (e.g. ngrok on :5173) can serve the whole demo:
// run with VITE_MARKET_DATA_URL=/api/market-data, VITE_INSIGHT_URL=/api/insight,
// VITE_NOTIFICATION_URL=/api/notification. The agent service (:8003) is
// deliberately NOT proxied -- it has real shell access and must stay local.
const proxied = (port: number, prefix: string) => ({
  target: `http://localhost:${port}`,
  changeOrigin: true,
  rewrite: (path: string) => path.slice(prefix.length) || '/',
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/market-data': proxied(8001, '/api/market-data'),
      '/api/insight': proxied(8002, '/api/insight'),
      '/api/notification': proxied(3000, '/api/notification'),
    },
  },
})
