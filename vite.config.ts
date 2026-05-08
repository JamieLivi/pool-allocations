import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
// Served at https://jamielivi.github.io/round-robin/ on GitHub Pages, so assets need
// to be prefixed with /round-robin/. Override with VITE_BASE env var if needed.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/round-robin/',
  plugins: [react()],
});
