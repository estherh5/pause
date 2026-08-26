import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Vite emits no source maps in a production build unless asked, unlike Next.
  // Without them every stack trace flare receives names a minified chunk and a
  // column number, which is a group with no culprit and nothing to act on.
  build: {
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: true,
  },
});
