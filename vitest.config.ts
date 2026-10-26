import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// Server code imports siblings as "./x.js" (what Vercel's runtime needs);
// in tests resolve those to the ".ts" source. Same plugin as methods.
const tsFromJs = {
  name: 'ts-from-js',
  enforce: 'pre' as const,
  resolveId(source: string, importer: string | undefined) {
    if (importer && source.endsWith('.js') && (source.startsWith('./') || source.startsWith('../'))) {
      const candidate = path.resolve(path.dirname(importer), source.replace(/\.js$/, '.ts'));
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  },
};

export default defineConfig({
  plugins: [tsFromJs, react()],
  test: {
    // Half the cores, not vitest's default of all-but-one: on 2026-10-26 parallel
    // suites across sessions pushed the 16GB Mac to 6.4/7.2GB swap and paged out
    // the always-on launchd servers. Fleet-wide cap; see vitals a331032.
    maxWorkers: "50%",
    projects: [
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['{api,lib,db,scripts,test}/**/*.test.ts'],
          setupFiles: ['./test/server-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['src/**/*.test.{js,jsx,ts,tsx}'],
          setupFiles: ['./src/test/setup.js'],
          css: true,
        },
      },
    ],
  },
});
