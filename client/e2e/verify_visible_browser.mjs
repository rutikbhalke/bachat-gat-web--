import { chromium } from '@playwright/test';

async function testVisibleBrowser() {
  console.log('Launching Playwright Chromium with headless: false...');
  
  let browser;
  try {
    browser = await chromium.launch({
      headless: false,
      slowMo: 1000,
      args: ['--start-maximized']
    });

    const context = await browser.newContext({
      viewport: null // Uses maximized window size
    });

    const page = await context.newPage();
    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000');

    console.log('VISIBLE_BROWSER_WINDOW_OPENED = YES');
    console.log('Keeping browser open on screen for 35 seconds...');

    for (let i = 35; i > 0; i -= 5) {
      console.log(`Time remaining: ${i} seconds...`);
      await page.waitForTimeout(5000);
    }

    console.log('Browser test window completed.');
  } catch (err) {
    console.error('Failed to open visible browser:', err);
    console.log('VISIBLE_BROWSER_WINDOW_OPENED = NO');
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

testVisibleBrowser();
