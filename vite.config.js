import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves a project site from https://<user>.github.io/<repo>/,
  // not the domain root -- without this, every asset URL in the built
  // index.html would be wrong and the page would load blank.
  base: '/safebite-india/',
})
