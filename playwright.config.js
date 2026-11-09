import { defineConfig } from '@playwright/test';

// The games' server and the race server, on the next port. Another copy of the folder can be tested at the
// same time with PORT=8652 npx playwright test, so the two don't use each other's.
const PORT = Number(process.env.PORT ?? 8642);
const RACE_PORT = PORT + 1;

export default defineConfig({
  testDir: './test/e2e',
  timeout: 240_000,
  expect: { timeout: 45_000 },
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results/artifacts',
  use: {
    baseURL: `http://localhost:${PORT}`,
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
  webServer: [
    {
      command: 'python3 tools/serve.py',
      url: `http://localhost:${PORT}/index.html`,
      env: { PORT: String(PORT) },
      reuseExistingServer: true,
    },
    // For playing with friends: the same rules as the server on Cloudflare.
    {
      command: 'node tools/race-server.mjs',
      port: RACE_PORT,
      env: { RACE_PORT: String(RACE_PORT) },
      reuseExistingServer: true,
    },
  ],
});
