import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' so the build is relocatable for GitHub Pages subpath hosting
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true }
})