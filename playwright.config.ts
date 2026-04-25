import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const localLinuxLibs = '/tmp/bm-playwright-libs/root/usr/lib/x86_64-linux-gnu';
const extraLinuxLibs = process.env['PLAYWRIGHT_EXTRA_LIBS'] ?? localLinuxLibs;
const browserEnv = existsSync(extraLinuxLibs)
  ? {
      LD_LIBRARY_PATH: [extraLinuxLibs, process.env['LD_LIBRARY_PATH']]
        .filter(Boolean)
        .join(':')
    }
  : undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4200',
    launchOptions: {
      env: browserEnv
    },
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'npm start -- --host 127.0.0.1 --port 4200',
    url: 'http://127.0.0.1:4200',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
