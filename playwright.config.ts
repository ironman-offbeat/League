import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  // Software WebGL on shared CI runners is CPU-heavy. Keep assertion timeouts
  // unchanged, but avoid parallel browser contention in the full-flow tests.
  testDir:'./tests/browser', timeout:process.env.CI?60000:30000, retries:0,
  workers:process.env.CI?1:undefined,
  use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'npm run preview -- --host 127.0.0.1 --port 4173',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI},
  projects:[
    {name:'desktop',use:{...devices['Desktop Chrome'],viewport:{width:1280,height:800}}},
    {name:'mobile-landscape',use:{...devices['iPhone 13'],defaultBrowserType:'chromium',viewport:{width:844,height:390},isMobile:true,hasTouch:true}},
    {name:'webkit-landscape',use:{...devices['iPhone 13'],viewport:{width:844,height:390}}},
  ],
});
