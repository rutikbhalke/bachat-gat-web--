const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2000);
  
  // Try to login
  await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'admin@bachatgat.com');
  await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'Admin@123');
  await page.click('button[type="submit"]');
  
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'dashboard.png' });
  
  console.log('Saved dashboard.png');
  await browser.close();
})();
