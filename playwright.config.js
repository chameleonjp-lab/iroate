import { defineConfig } from '@playwright/test';
const baseURL = `http://127.0.0.1:${process.env.IROATE_TEST_PORT || 4173}/iroate/`;
export default defineConfig({
  testDir: './test/browser',
  timeout: 45000,
  fullyParallel: true,
  workers: 2,
  use: {baseURL, viewport:{width:390,height:844}, trace:'retain-on-failure'},
  projects: [{name:'chromium',use:{browserName:'chromium'}},{name:'webkit',use:{browserName:'webkit'}}],
  webServer: {command:'node scripts/serve.js',url:baseURL,reuseExistingServer:!process.env.CI}
});
