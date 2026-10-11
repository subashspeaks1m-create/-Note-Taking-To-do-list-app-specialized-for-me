import { defineConfig, devices } from '@playwright/test';

/**
 * Browser checks for the acceptance list (docs/ACCEPTANCE_REPORT.md).
 * `npm run e2e` starts a dev server; the offline check builds the app and
 * serves the production build, because only it has the service worker.
 * Set PW_CHROMIUM to use an already-installed Chromium.
 */
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.results',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    timezoneId: 'Asia/Kolkata',
    locale: 'en-US',
    launchOptions: { executablePath },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'app', testIgnore: /offline\.spec/, use: { baseURL: 'http://localhost:5199' } },
    { name: 'offline', testMatch: /offline\.spec/, use: { baseURL: 'http://localhost:4199' } },
  ],
  webServer: [
    { command: 'npx vite --port 5199 --strictPort', url: 'http://localhost:5199', reuseExistingServer: true, timeout: 60_000 },
    { command: 'npm run build && npx vite preview --port 4199 --strictPort', url: 'http://localhost:4199', reuseExistingServer: true, timeout: 180_000 },
  ],
});
