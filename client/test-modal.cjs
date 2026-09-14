
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto('http://localhost:3000');
  
  await page.fill('input[type=\"email\"]', 'admin3@bachatgat.com');
  await page.fill('input[type=\"password\"]', '123456');
  await page.click('button[type=\"submit\"]');
  
  await page.waitForSelector('text=Dashboard');
  await page.click('text=Loans');
  await page.click('text=Pay Installment');
  await page.waitForSelector('text=Record Loan Payment');
  await page.waitForTimeout(1000); 
  await page.screenshot({ path: 'modal-screenshot.png' });
  await browser.close();
})();
