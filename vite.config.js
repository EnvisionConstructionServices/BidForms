import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // This MUST match your repository name exactly (case-sensitive)
  base: '/BidForms/', 
})
