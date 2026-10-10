import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  use: { baseURL: "http://127.0.0.1:8080", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:8080",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
});
