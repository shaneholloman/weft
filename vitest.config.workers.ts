import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import path from 'path';

export default defineWorkersConfig({
  test: {
    include: ['tests/worker/**/*.integration.test.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
      },
    },
  },
  resolve: {
    alias: {
      // Containers/Sandbox not supported in vitest-pool-workers
      '@cloudflare/sandbox': path.resolve(__dirname, 'tests/mocks/cloudflare-sandbox.ts'),
      '@cloudflare/containers': path.resolve(__dirname, 'tests/mocks/cloudflare-sandbox.ts'),
    },
  },
});
