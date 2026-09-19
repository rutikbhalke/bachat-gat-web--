import { chromium } from 'playwright';

async function measure() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('--- STARTING PERFORMANCE MEASUREMENT ---');

  // Navigate to login
  const startLogin = Date.now();
  await page.goto('http://localhost:3001/login');
  await page.fill('input[type="email"]', 'admin@example.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button:has-text("Sign In")');
  
  // Dashboard First Render
  const dashboardFirstRender = Date.now() - startLogin;
  console.log(`Login -> Dashboard First Render: ${dashboardFirstRender} ms`);

  // Dashboard Fully Interactive
  await page.waitForSelector('text="Available Balance"', { state: 'visible', timeout: 60000 });
  const dashboardFullyInteractive = Date.now() - startLogin;
  console.log(`Dashboard Fully Interactive (from login): ${dashboardFullyInteractive} ms`);
  console.log(`Dashboard Data Fetch Time: ${dashboardFullyInteractive - dashboardFirstRender} ms`);

  // Navigate to Members
  const startMembers = Date.now();
  await page.goto('http://localhost:3001/members');
  await page.waitForSelector('text="Total Registered Members"', { state: 'visible', timeout: 60000 });
  console.log(`Members Page Load Time: ${Date.now() - startMembers} ms`);

  // Navigate to Savings
  const startSavings = Date.now();
  await page.goto('http://localhost:3001/savings');
  await page.waitForSelector('text="Total Expected Savings"', { state: 'visible', timeout: 60000 }).catch(() => {});
  console.log(`Savings Page Load Time: ${Date.now() - startSavings} ms`);

  // Navigate to Loans
  const startLoans = Date.now();
  await page.goto('http://localhost:3001/loans');
  await page.waitForSelector('text="Active Loans"', { state: 'visible', timeout: 60000 });
  console.log(`Loans Page Load Time: ${Date.now() - startLoans} ms`);

  // Navigate to Reports
  const startReports = Date.now();
  await page.goto('http://localhost:3001/reports');
  await page.waitForSelector('text="Taaleband"', { state: 'visible', timeout: 60000 });
  console.log(`Reports Page Load Time: ${Date.now() - startReports} ms`);

  await browser.close();
}

measure().catch(console.error);
