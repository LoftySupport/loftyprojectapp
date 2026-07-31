import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // served from /app/ alongside the tokenised prototype at the root
  base: "/app/",
  plugins: [react()],
})
