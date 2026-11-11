import { defineConfig } from 'vite';

// GitHub Pages serves the site from /<repo>/, so the build needs that base.
// Dev server stays at / so localhost and LAN URLs are unchanged.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/house_3d_double/' : '/',
}));
