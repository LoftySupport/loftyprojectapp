import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // The app is the site now — served from the root, not a subfolder. The router's
  // basename and the OAuth redirectTo both read import.meta.env.BASE_URL, so this one
  // value is the only place the path is decided.
  base: "/",
  plugins: [react()],
})
