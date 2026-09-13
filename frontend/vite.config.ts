import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// In dev, `npm run dev` proxies /api and /ws to the Django server (run
// separately with `python manage.py runserver`) so there's no CORS/CSRF
// cross-origin dance during development.
//
// In production, `npm run build` writes to ../backend/frontend_dist and
// Django serves it directly (see backend/breadboard/views.py) -- the
// "npm build frontend to backend, to run as monosite" requirement.
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  // Matches STATIC_URL in backend/breadboard/settings.py so the built
  // index.html's asset references (e.g. /static/assets/index-XXXX.js)
  // resolve once Django serves this directory as static files. Only applied
  // to the production build: Django's catch-all view (breadboard/views.py)
  // serves the SPA's pages at plain routes (/, /manager, ...) and only the
  // built JS/CSS files live under /static/, so react-router's basename-less
  // routes need `npm run dev` to keep serving the app at the real root --
  // setting this base unconditionally makes Vite's dev server redirect `/`
  // to `/static/`, which no route matches, rendering a blank page.
  base: command === 'build' ? '/static/' : '/',
  build: {
    outDir: '../backend/frontend_dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
      },
    },
  },
}))
