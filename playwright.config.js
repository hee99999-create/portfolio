// @ts-check
const { defineConfig } = require('@playwright/test');

/**
 * PORTRI AI E2E 설정.
 * 전제: 프론트 서버가 http://localhost:8125 에서 실행 중이어야 함
 *       (cd app && python serve.py 8125)
 */
module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: process.env.PORTRI_BASE || 'http://localhost:8125',
    headless: true,
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
