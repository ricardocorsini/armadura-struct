import { defineConfig } from '@playwright/test';

// Roteiro de reprodução do ensaio da issue #180. Não faz parte da suíte E2E.
// Uso: suba o app (npm run dev -- --port 5180) e rode
//   npx playwright test -c docs/usabilidade/grampo-viga/playwright.ensaio.config.ts
// ARMSTRUCT_CHROMIUM permite apontar um Chrome/Edge já instalado.
export default defineConfig({
  testDir: '.',
  testMatch: 'ensaio.spec.ts',
  workers: 1,
  timeout: 120000,
  reporter: [['list']],
  use: {
    baseURL: process.env.ENSAIO_URL || 'http://127.0.0.1:5180',
    viewport: { width: 1366, height: 768 },
    launchOptions: process.env.ARMSTRUCT_CHROMIUM
      ? { executablePath: process.env.ARMSTRUCT_CHROMIUM }
      : {},
  },
});
