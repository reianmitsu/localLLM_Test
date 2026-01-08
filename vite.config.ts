import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: './', // Use relative path for GitHub Pages compatibility
  worker: {
    format: 'es', // Ensure workers are built as ES modules
  }
})
