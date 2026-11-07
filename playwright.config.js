import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 240_000,
  expect: { timeout: 45_000 },
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results/artifacts',
  use: {
    baseURL: 'http://localhost:8642',
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // The installed Google Chrome, which is the browser this game targets, on the
    // computer's real GPU. On a software GPU the tracker manages about one frame a second.
    channel: 'chrome',
    launchOptions: {
      args: [
        '--enable-gpu',
        '--ignore-gpu-blocklist',
        ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
      ],
    },
  },
  webServer: {
    command: 'python3 tools/serve.py',
    url: 'http://localhost:8642/index.html',
    reuseExistingServer: true,
  },
});
