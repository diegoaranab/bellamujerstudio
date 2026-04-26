import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['dist/**', 'node_modules/**', 'cdk.out/**'],
    globals: true,
    restoreMocks: true
  }
});
