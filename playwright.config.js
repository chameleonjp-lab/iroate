import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/browser',
  timeout: 45000,
  fullyParallel: true,
  workers: 2,
  use: {baseURL:'http://127.0.0.1:4173/iroate/', viewport:{width:390,height:844}, trace:'retain-on-failure'},
  projects: [{name:'chromium',use:{browserName:'chromium'}},{name:'webkit',use:{browserName:'webkit'}}],
  webServer: {command:'node scripts/serve.js',url:'http://127.0.0.1:4173/iroate/',reuseExistingServer:!process.env.CI}
});
