import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'tests/e2e',workers:1,fullyParallel:false,timeout:40_000,
  use:{baseURL:'http://127.0.0.1:5173',headless:true,trace:'retain-on-failure'},
  reporter:[['list'],['html',{open:'never'}]],
  webServer:{command:'npm run demo',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI,timeout:40_000},
});
