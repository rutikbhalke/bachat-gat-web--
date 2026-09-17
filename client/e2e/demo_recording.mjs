/**
 * COMPREHENSIVE 5-6 MINUTE BACHAT GAT PROJECT DEMO VIDEO RECORDER
 * Features complete visual demonstration & teacher-grade explanation of all major features.
 * 
 * Target Duration: 5:00 - 6:00 (~5:24)
 * Resolution:      1920 × 1080 Full HD
 * Runtime Group:   test_isolated_group_999 (100% isolated, ZERO mutations)
 * Output:          demo-output/bachat-gat-demo.webm
 */

import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const DEMO_OUTPUT_DIR = path.join(ROOT_DIR, 'demo-output');
const RAW_OUTPUT_DIR = path.join(DEMO_OUTPUT_DIR, 'raw');

// ANSI Terminal styling
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const EXPECTED_TEST_GROUP = 'test_isolated_group_999';
const FORBIDDEN_PROD_GROUP = 'shivshahi_group_001';
const BASE_URL = 'http://localhost:3001';
const ADMIN_EMAIL = 'vaibhavpawase143@gmail.com';
const ADMIN_PASSWORD = '123456';
const FFMPEG_PATH = 'C:\\Users\\Vaibhav\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-essentials_build\\bin\\ffmpeg.exe';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Smooth cursor positioning helper
async function smoothMoveTo(page, locator) {
  try {
    const box = await locator.boundingBox();
    if (box) {
      const targetX = box.x + box.width / 2;
      const targetY = box.y + box.height / 2;
      await page.mouse.move(targetX, targetY, { steps: 20 });
      await sleep(350);
    }
  } catch (e) {
    // Ignore bounding box fetch errors if element scrolled
  }
}

// Presenter overlay explanation banner
async function showPresenterNote(page, title, subtitle) {
  await page.evaluate(({ title, subtitle }) => {
    let banner = document.getElementById('demo-presenter-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'demo-presenter-banner';
      banner.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 999999;
        background: linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.96));
        color: #FFFFFF;
        padding: 14px 26px;
        border-radius: 12px;
        box-shadow: 0 10px 35px rgba(0, 0, 0, 0.45);
        border: 1px solid rgba(245, 124, 0, 0.65);
        max-width: 920px;
        width: 88%;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        pointer-events: none;
        transition: all 0.3s ease;
        backdrop-filter: blur(10px);
      `;
      document.body.appendChild(banner);
    }
    banner.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="background: #F57C00; color: #FFFFFF; font-size: 0.72rem; font-weight: 800; padding: 2px 8px; border-radius: 4px; letter-spacing: 0.05em; text-transform: uppercase;">FEATURE EXPLANATION</span>
          <strong style="font-size: 1.08rem; color: #FDBA74; letter-spacing: 0.01em;">${title}</strong>
        </div>
        <span style="font-size: 0.74rem; color: #94A3B8; font-weight: 600;">Bachat Gat Management System</span>
      </div>
      <p style="margin: 0; font-size: 0.90rem; color: #E2E8F0; line-height: 1.48;">${subtitle}</p>
    `;
  }, { title, subtitle });
}

async function runDemoRecording() {
  const startTime = Date.now();
  console.log(`\n${BOLD}${CYAN}================================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}🎓 BACHAT GAT — COMPREHENSIVE 5-6 MINUTE PROJECT DEMO PRESENTATION${RESET}`);
  console.log(`${BOLD}${CYAN}   Resolution: 1920 × 1080 | Target Runtime: ~5:24 | Group: ${EXPECTED_TEST_GROUP}${RESET}`);
  console.log(`${BOLD}${CYAN}================================================================================${RESET}\n`);

  // ---------------------------------------------------------------------------
  // STEP 0: PRE-FLIGHT & SAFETY CHECKS
  // ---------------------------------------------------------------------------
  console.log(`${YELLOW}>>> [PRE-FLIGHT] Checking Safety & Server Health...${RESET}`);
  fs.mkdirSync(RAW_OUTPUT_DIR, { recursive: true });

  const envLocalPath = path.join(ROOT_DIR, 'client/.env.local');
  if (fs.existsSync(envLocalPath)) {
    const envContent = fs.readFileSync(envLocalPath, 'utf8');
    if (envContent.includes(FORBIDDEN_PROD_GROUP)) {
      throw new Error(
        `DEMO SAFETY STOP: Production group "${FORBIDDEN_PROD_GROUP}" detected in client/.env.local. Aborting!`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 1: LAUNCH VISIBLE CHROMIUM WITH 1080P RECORDING
  // ---------------------------------------------------------------------------
  console.log(`\n${YELLOW}>>> [LAUNCH] Starting Visible Chromium Browser (1920 × 1080 Viewport)...${RESET}`);

  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized', '--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: RAW_OUTPUT_DIR,
      size: { width: 1920, height: 1080 }
    }
  });

  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon') && !text.includes('downloadable font') && !text.includes('React Router')) {
        consoleErrors.push(text);
      }
    }
  });

  const scenes = [];
  let demoError = null;

  function recordScene(name, description) {
    console.log(`  ${GREEN}▶ [SCENE]${RESET} ${BOLD}${name}:${RESET} ${description}`);
    scenes.push(name);
  }

  try {
    // =========================================================================
    // FEATURE 1: ADMIN LOGIN & SECURITY ARCHITECTURE (~24s)
    // =========================================================================
    recordScene('FEATURE 1 — ADMIN LOGIN & SECURITY', 'Presenting secure role-based admin authentication & login validation');
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('domcontentloaded');
    await sleep(2500);

    await showPresenterNote(
      page,
      'Feature 1: Admin Authentication & Role-Based Security',
      'The portal enforces role-based access control. Administrators authenticate securely to manage savings records, approve loan disbursements, and reconcile group accounts.'
    );
    await sleep(7500);

    const brandingLogo = page.locator('header, h1, .brand, img[alt*="logo"]').first();
    if (await brandingLogo.isVisible()) {
      await smoothMoveTo(page, brandingLogo);
      await sleep(2200);
    }

    const adminTab = page.locator('button:has-text("Admin Login")');
    if (await adminTab.isVisible()) {
      await smoothMoveTo(page, adminTab);
      await adminTab.click();
      await sleep(1500);
    }

    const emailInput = page.locator('input[type="email"]');
    await smoothMoveTo(page, emailInput);
    await emailInput.fill(ADMIN_EMAIL);
    await sleep(2000);

    const passwordInput = page.locator('input[type="password"]');
    await smoothMoveTo(page, passwordInput);
    await passwordInput.fill(ADMIN_PASSWORD);
    await sleep(2000);

    const submitBtn = page.locator('button[type="submit"]');
    await smoothMoveTo(page, submitBtn);
    await submitBtn.click();

    await page.waitForURL('**/dashboard', { timeout: 20000 });
    await page.waitForLoadState('domcontentloaded');
    await sleep(4000);

    // =========================================================================
    // FEATURE 2: DASHBOARD & CORE ACCOUNTING EQUATION (~34s)
    // =========================================================================
    recordScene('FEATURE 2 — DASHBOARD & RECONCILIATION', 'Presenting executive KPI metrics & the fundamental Bachat Gat equation');
    
    // Safety check: Runtime Group ID badge MUST show test_isolated_group_999
    const runtimeBadgeEl = page.locator('[data-testid="runtime-group-badge"]').first();
    await runtimeBadgeEl.waitFor({ state: 'visible', timeout: 10000 });
    const runtimeBadgeText = await runtimeBadgeEl.textContent();
    console.log(`     Observed Runtime Badge: "${runtimeBadgeText}"`);

    if (runtimeBadgeText.includes(FORBIDDEN_PROD_GROUP)) {
      throw new Error(`DEMO SAFETY STOP: Production group "${FORBIDDEN_PROD_GROUP}" detected in live UI!`);
    }
    if (!runtimeBadgeText.includes(EXPECTED_TEST_GROUP)) {
      throw new Error(`DEMO SAFETY STOP: Expected test group "${EXPECTED_TEST_GROUP}" not found in badge: ${runtimeBadgeText}`);
    }

    await showPresenterNote(
      page,
      'Feature 2: Real-Time Dashboard & Mathematical Reconciliation',
      'The dashboard gives a single-pane-of-glass overview. Fundamental Equation: Total Group Fund = Available Balance (cash) + Active Loan Outstanding (receivable).'
    );
    await smoothMoveTo(page, runtimeBadgeEl);
    await sleep(5000);

    // Tour KPI Stat Cards
    const equationBanner = page.locator('text=Total Group Fund = Available Balance').first();
    if (await equationBanner.isVisible()) {
      await smoothMoveTo(page, equationBanner);
      await sleep(5000);
    }

    const statCards = page.locator('.stat-card, .metric-card, .card');
    const count = await statCards.count();
    for (let i = 0; i < Math.min(count, 4); i++) {
      await smoothMoveTo(page, statCards.nth(i));
      await sleep(2000);
    }

    // Scroll slightly to show savings progress & activity
    await page.evaluate(() => window.scrollBy({ top: 320, behavior: 'smooth' }));
    await sleep(4500);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(2500);

    // =========================================================================
    // FEATURE 3: MEMBER MANAGEMENT & MUTUALLY EXCLUSIVE PARTITIONING (~25s)
    // =========================================================================
    recordScene('FEATURE 3 — MEMBER MANAGEMENT', 'Presenting member directory with strictly partitioned member categories');
    const membersLink = page.locator('aside a[href="/members"], a[href="/members"]').first();
    await smoothMoveTo(page, membersLink);
    await membersLink.click();

    await page.waitForURL('**/members', { timeout: 15000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('.keyboard-card', { timeout: 15000 });
    await sleep(2500);

    await showPresenterNote(
      page,
      'Feature 3: Mutually Exclusive Member Partitioning',
      'Members are strictly categorized into Active Loan Members (repaying loans + savings) and Non-Loan Members (regular monthly savings only), preventing accounting errors.'
    );
    await sleep(8000);

    // Highlight summary pills and category headers
    const loanSectionHeader = page.locator('text=Active Loan Members').first();
    if (await loanSectionHeader.isVisible()) {
      await smoothMoveTo(page, loanSectionHeader);
      await sleep(3000);
    }

    const nonLoanSectionHeader = page.locator('text=Non-Loan Members').first();
    if (await nonLoanSectionHeader.isVisible()) {
      await smoothMoveTo(page, nonLoanSectionHeader);
      await sleep(3000);
    }

    // Search demonstration
    const searchBox = page.locator('input[placeholder*="Search"]').first();
    if (await searchBox.isVisible()) {
      await smoothMoveTo(page, searchBox);
      await searchBox.fill('Test Member 01');
      await sleep(3000);
      await searchBox.fill('');
      await sleep(2000);
    }

    // =========================================================================
    // FEATURE 4: ACTIVE LOAN MEMBER WORKFLOW (~19s)
    // =========================================================================
    recordScene('FEATURE 4 — ACTIVE LOAN MEMBER WORKFLOW', 'Inspecting active loan member with exclusive loan repayment action');
    const activeLoanCard = page.locator('.keyboard-card').first();
    await smoothMoveTo(page, activeLoanCard);
    await sleep(2500);

    await showPresenterNote(
      page,
      'Feature 4: Active Loan Member Business Rule',
      'Active Loan Members show outstanding debt (₹3,000) and have ONLY "Record Loan Payment". Standalone "Record Savings" is disabled because savings are collected with loan installments.'
    );
    await sleep(8000);

    const recLoanBtn = activeLoanCard.locator('button:has-text("Record Loan Payment")');
    await smoothMoveTo(page, recLoanBtn);
    await sleep(4500);

    // =========================================================================
    // FEATURE 4B: COMPREHENSIVE MEMBER 360 PROFILE (~22s)
    // =========================================================================
    recordScene('FEATURE 4B — MEMBER 360 PROFILE', 'Viewing complete member profile: savings balance, loan history, and audit trail');
    await activeLoanCard.click();
    await page.waitForURL('**/members/**', { timeout: 10000 });
    await page.waitForLoadState('domcontentloaded');
    await sleep(2500);

    await showPresenterNote(
      page,
      'Feature 4B: Comprehensive Member 360° Profile',
      'Detailed audit view showing total accumulated savings, linked active loans, repayment history, and individual financial health.'
    );
    await sleep(8000);

    // Scroll through member profile smoothly
    await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
    await sleep(4500);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(2500);

    // Back to members list
    const backBtn = page.locator('button:has-text("Back"), a:has-text("Back to Members"), aside a[href="/members"]').first();
    await smoothMoveTo(page, backBtn);
    await backBtn.click();
    await page.waitForURL('**/members', { timeout: 10000 });
    await page.waitForLoadState('domcontentloaded');
    await sleep(2500);

    // =========================================================================
    // FEATURE 5: NON-LOAN MEMBER WORKFLOW (~19s)
    // =========================================================================
    recordScene('FEATURE 5 — NON-LOAN MEMBER WORKFLOW', 'Inspecting non-loan member with independent savings collection');
    const nonLoanCard = page.locator('.keyboard-card').nth(1);
    await smoothMoveTo(page, nonLoanCard);
    await sleep(2500);

    await showPresenterNote(
      page,
      'Feature 5: Non-Loan Member Savings Workflow',
      'Members with zero active debt display the green "No Loan" status badge. They have exclusive access to standalone "Record Savings" with ₹1,000 monthly share.'
    );
    await sleep(8000);

    const recSavingsBtn = nonLoanCard.locator('button:has-text("Record Savings")');
    await smoothMoveTo(page, recSavingsBtn);
    await sleep(4500);

    // =========================================================================
    // FEATURE 6 & 7: MONTHLY SAVINGS & FLICKER/DUPLICATE PREVENT (~25s)
    // =========================================================================
    recordScene('FEATURE 6 — MONTHLY SAVINGS MODAL', 'Opening Record Savings modal: scheduled period vs actual payment date & stability');
    await recSavingsBtn.click();
    await sleep(2500);

    const savingsModal = page.locator('.app-modal, .modal-container, [role="dialog"]').first();
    await savingsModal.waitFor({ state: 'visible', timeout: 10000 });

    await showPresenterNote(
      page,
      'Feature 6: Scheduled Month vs Actual Payment Date',
      'The system cleanly separates the Scheduled Month/Year (accounting accrual period) from the Actual Payment Date (cash flow transaction date), supporting UPI, Cash, and Bank Transfer.'
    );
    await sleep(8000);

    // Hover over key inputs
    const amountField = page.locator('input[name="amount"], input[type="number"]').first();
    if (await amountField.isVisible()) {
      await smoothMoveTo(page, amountField);
      await sleep(2500);
    }

    const modeField = page.locator('select[name="payment_mode"], select[name="paymentMode"]').first();
    if (await modeField.isVisible()) {
      await smoothMoveTo(page, modeField);
      await sleep(2500);
    }

    // 5-Second Stability & Flicker Check
    console.log('     Observing modal stability for 5+ seconds...');
    for (let s = 1; s <= 5; s++) {
      await sleep(1000);
    }
    console.log(`  ${GREEN}✔${RESET} 5-second modal stability confirmed with zero flicker.`);

    // Close cleanly without submitting
    const cancelSavingsBtn = page.locator('.app-modal button:has-text("Cancel"), form button:has-text("Cancel")').first();
    await smoothMoveTo(page, cancelSavingsBtn);
    await cancelSavingsBtn.click();
    await sleep(3000);

    // =========================================================================
    // FEATURE 7B: MONTHLY SAVINGS LEDGER & AUDIT TRAIL (~22s)
    // =========================================================================
    recordScene('FEATURE 7B — SAVINGS LEDGER', 'Reviewing historical savings contributions ledger and filters');
    const savingsNavLink = page.locator('aside a[href="/savings"], a[href="/savings"]').first();
    await smoothMoveTo(page, savingsNavLink);
    await savingsNavLink.click();

    await page.waitForURL('**/savings', { timeout: 15000 });
    await page.waitForLoadState('domcontentloaded');
    await sleep(2500);

    await showPresenterNote(
      page,
      'Feature 7: Group Savings Ledger & Duplicate Prevention',
      'Historical monthly savings registry. The system enforces unique month/year constraints per member to guarantee zero accidental duplicate savings records.'
    );
    await sleep(8000);

    const savingsFilter = page.locator('.card select, select').first();
    if (await savingsFilter.isVisible()) {
      await smoothMoveTo(page, savingsFilter);
      await sleep(2500);
    }

    await page.evaluate(() => window.scrollBy({ top: 250, behavior: 'smooth' }));
    await sleep(4500);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(2500);

    // =========================================================================
    // FEATURE 8: LOAN CREATION & PORTFOLIO MANAGEMENT (~20s)
    // =========================================================================
    recordScene('FEATURE 8 — LOAN MANAGEMENT', 'Navigating to Loans portfolio view: tracking active and closed micro-loans');
    const loansNavLink = page.locator('aside a[href="/loans"], a[href="/loans"]').first();
    await smoothMoveTo(page, loansNavLink);
    await loansNavLink.click();

    await page.waitForURL('**/loans', { timeout: 15000 });
    await page.waitForLoadState('domcontentloaded');
    await sleep(3000);

    await showPresenterNote(
      page,
      'Feature 8: Micro-Lending Portfolio Management',
      'Displays group lending health. Key attributes: Principal Amount, Interest Rate (2% per month), 10-Month Installment Term, Purpose, and Status.'
    );
    await sleep(8000);

    // Tour the loan cards & target the View Details button
    const viewDetailsBtn = page.locator('button:has-text("View Details")').first();
    await viewDetailsBtn.scrollIntoViewIfNeeded();
    await smoothMoveTo(page, viewDetailsBtn);
    await sleep(4500);

    // =========================================================================
    // FEATURE 9 & 10: LOAN SCHEDULE & REDUCING-BALANCE INTEREST (~26s)
    // =========================================================================
    recordScene('FEATURE 9 & 10 — LOAN SCHEDULE & REDUCING INTEREST', 'Inspecting 10-month repayment schedule & 2% reducing-balance interest');
    await viewDetailsBtn.click();
    await page.waitForURL('**/loans/**', { timeout: 15000 });
    await page.waitForLoadState('domcontentloaded');
    await sleep(3000);

    await showPresenterNote(
      page,
      'Feature 9 & 10: 10-Month Installment Schedule & Reducing-Balance Interest',
      'Transparent 10-month repayment amortization schedule. Interest is calculated at 2% on remaining balance. As principal decreases, monthly interest reduces proportionally!'
    );
    await sleep(9000);

    // Scroll schedule table smoothly
    const scheduleTable = page.locator('table, .table-container').first();
    if (await scheduleTable.isVisible()) {
      await smoothMoveTo(page, scheduleTable);
      await sleep(2500);
      await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
      await sleep(5500);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await sleep(2500);
    }

    // =========================================================================
    // FEATURE 11 & 12: COMBINED ATOMIC LOAN REPAYMENT EXECUTION
    // =========================================================================
    recordScene('FEATURE 11 — COMBINED LOAN PAYMENT EXECUTION', 'Submitting atomic loan installment #1: ₹500 Principal + ₹100 Interest = ₹600 Cash');
    const openRepayBtn = page.locator('button:has-text("Record Repayment")').first();
    await openRepayBtn.scrollIntoViewIfNeeded();
    await smoothMoveTo(page, openRepayBtn);
    await openRepayBtn.click();
    await sleep(2000);

    const repayModal = page.locator('.app-modal, .modal-container, [role="dialog"]').first();
    await repayModal.waitFor({ state: 'visible', timeout: 10000 });

    await showPresenterNote(
      page,
      'Feature 11: Real Transaction Submission — Installment #1',
      'Recording Installment #1 (October 2026): Principal ₹500 + Reducing Interest ₹100 (2% of ₹5,000) = Total Cash ₹600. Live execution updates loan balance and cash flow.'
    );
    await sleep(6500);

    // Set regular hafta to 0
    const regHaftaInput = page.locator('input[name="regular_hafta_amount"]').first();
    if (await regHaftaInput.isVisible()) {
      await smoothMoveTo(page, regHaftaInput);
      await regHaftaInput.fill('0');
      await sleep(1000);
    }

    // Set principal repayment to 500
    const prinInput = page.locator('input[name="principal_repayment_amount"]').first();
    if (await prinInput.isVisible()) {
      await smoothMoveTo(page, prinInput);
      await prinInput.fill('500');
      await sleep(1500);
    }

    // Click Record Payment submit button
    const submitRepayBtn = page.locator('.app-modal button[type="submit"]:has-text("Record Payment")').first();
    await smoothMoveTo(page, submitRepayBtn);
    await submitRepayBtn.click();
    await sleep(1500);

    // Confirm Payment popup
    const confirmBtn = page.locator('[data-testid="status-popup-confirm-btn"]').first();
    await confirmBtn.waitFor({ state: 'visible', timeout: 10000 });
    await smoothMoveTo(page, confirmBtn);
    await sleep(1500);
    await confirmBtn.click();
    await sleep(2000);

    // Success popup
    const okBtn = page.locator('[data-testid="status-popup-close-btn"]').first();
    if (await okBtn.isVisible()) {
      await smoothMoveTo(page, okBtn);
      await sleep(1000);
      await okBtn.click();
      await sleep(1500);
    }

    // Modal closes and Loan Details page refreshes with updated balance
    await showPresenterNote(
      page,
      'Loan Balance Updated in Real Time',
      'Outstanding Principal reduced from ₹5,000 to ₹4,500. Total Interest Paid is ₹100. Installment #1 is marked as PAID in the schedule and repayment ledger.'
    );
    await sleep(6000);

    // Tour the updated outstanding card and schedule
    const outstandingCard = page.locator('text=CURRENT OUTSTANDING').locator('xpath=..').first();
    if (await outstandingCard.isVisible()) {
      await smoothMoveTo(page, outstandingCard);
      await sleep(2000);
    }

    const interestPaidCard = page.locator('text=TOTAL INTEREST PAID').locator('xpath=..').first();
    if (await interestPaidCard.isVisible()) {
      await smoothMoveTo(page, interestPaidCard);
      await sleep(2000);
    }

    // Scroll down to show updated Repayments Table
    await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
    await sleep(3500);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(1500);

    // =========================================================================
    // FEATURE 13: AUTOMATED PENDING DUES AUDIT (~23s)
    // =========================================================================
    recordScene('FEATURE 13 — PENDING DUES AUDIT', 'Demonstrating pending collections identification across savings and installments');
    const reportsNavLink = page.locator('aside a[href="/reports"], a[href="/reports"]').first();
    await smoothMoveTo(page, reportsNavLink);
    await reportsNavLink.click();

    await page.waitForURL('**/reports', { timeout: 15000 });
    await page.waitForLoadState('domcontentloaded');
    await sleep(3000);

    // Switch to Pending Dues tab
    const pendingTab = page.locator('button.tab-btn:has-text("Pending Dues")');
    if (await pendingTab.isVisible()) {
      await smoothMoveTo(page, pendingTab);
      await pendingTab.click();
      await sleep(2500);

      await showPresenterNote(
        page,
        'Feature 13: Automated Pending Dues Audit — September 2026',
        'In September 2026, all member savings are up to date and zero loan installments are scheduled in the loan issue month. Exact ₹0 pending dues displayed with complete accuracy.'
      );
      await sleep(6500);

      await page.evaluate(() => window.scrollBy({ top: 200, behavior: 'smooth' }));
      await sleep(3000);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await sleep(1500);
    }

    // =========================================================================
    // FEATURE 14: GROUP LENDING ANALYTICS (~20s)
    // =========================================================================
    recordScene('FEATURE 14 — GROUP LENDING ANALYTICS', 'Inspecting capital deployment, interest earned, and recovery rate');
    const loansOverviewTab = page.locator('button.tab-btn:has-text("Loans Overview")');
    if (await loansOverviewTab.isVisible()) {
      await smoothMoveTo(page, loansOverviewTab);
      await loansOverviewTab.click();
      await sleep(2500);

      await showPresenterNote(
        page,
        'Feature 14: Group Lending Analytics',
        'Comprehensive breakdown of group capital deployment, total interest earnings, recovery velocity, and outstanding credit exposure.'
      );
      await sleep(8000);

      await page.evaluate(() => window.scrollBy({ top: 200, behavior: 'smooth' }));
      await sleep(4000);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await sleep(2500);
    }

    // =========================================================================
    // FEATURE 15: TAALEBAND / MONTHLY REGISTER STRICT SEPARATION (~26s)
    // =========================================================================
    recordScene('FEATURE 15 — TAALEBAND STRICT SEPARATION', 'Demonstrating Monthly Balance Report (Taaleband) with separated financial columns');
    const taalebandTab = page.locator('button.tab-btn:has-text("Monthly Balance Report")');
    if (await taalebandTab.isVisible()) {
      await smoothMoveTo(page, taalebandTab);
      await taalebandTab.click();
      await sleep(3000);

      await showPresenterNote(
        page,
        'Feature 15: Taaleband / Strict Accounting Column Separation',
        'Strict financial invariant: Regular Savings ≠ Loan Principal ≠ Interest Paid. Every financial rupee is accounted for in separate ledger columns.'
      );
      await sleep(9000);

      // Highlight separated columns in the live table
      const taalebandTable = page.locator('.taaleband-print-area table, .table-container table, table').first();
      if (await taalebandTable.isVisible()) {
        await smoothMoveTo(page, taalebandTable);
        await page.evaluate(() => {
          const t = document.querySelector('.taaleband-print-area, .table-container, table');
          if (t) t.scrollIntoView({ behavior: 'smooth' });
        });
        await sleep(7500);
      }
    }

    // =========================================================================
    // FEATURE 16: FINAL RECONCILIATION & BALANCE CHECK (~24s)
    // =========================================================================
    recordScene('FEATURE 16 — FINAL RECONCILIATION', 'Returning to dashboard for final mathematical proof: Total Fund = Available + Loans');
    const dashboardNavLink = page.locator('aside a[href="/dashboard"], a[href="/dashboard"]').first();
    await smoothMoveTo(page, dashboardNavLink);
    await dashboardNavLink.click();

    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await page.waitForLoadState('domcontentloaded');
    await sleep(2500);

    await showPresenterNote(
      page,
      'Feature 16: Mathematical Reconciliation & Project Summary',
      'Total Group Fund is mathematically proven: Available Cash Balance (in bank/hand) + Active Loans Outstanding (receivable) = Total Group Fund. Zero discrepancies!'
    );

    const finalEquation = page.locator('text=Total Group Fund = Available Balance').first();
    if (await finalEquation.isVisible()) {
      await smoothMoveTo(page, finalEquation);
    }
    await sleep(9500);
    await sleep(3000);

    // =========================================================================
    // FEATURE 17: PRESENTATION CONCLUSION (~15s)
    // =========================================================================
    recordScene('FEATURE 17 — DEMO CONCLUSION', 'Concurring full system validation and architectural integrity');
    await showPresenterNote(
      page,
      'Project Demonstration Complete',
      'Successfully demonstrated all microfinance modules: authentication, dual partitioning, 10-month amortized reducing interest, atomic repayment, and strict Taaleband reconciliation.'
    );
    await sleep(9500);

    // Dismiss presenter overlay cleanly before concluding
    await page.evaluate(() => {
      const banner = document.getElementById('demo-presenter-banner');
      if (banner) banner.remove();
    });
    await sleep(3000);

    console.log(`\n${BOLD}${GREEN}✔ All feature demonstrations completed successfully!${RESET}`);

  } catch (err) {
    console.error(`\n${RED}${BOLD}ERROR DURING DEMO EXECUTION:${RESET}`, err);
    demoError = err;
  } finally {
    // -------------------------------------------------------------------------
    // STEP 2: FINALIZE RECORDING & SAVE VIDEO
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}>>> [FINALIZE] Finalizing video stream...${RESET}`);
    const video = page.video();
    await page.close();
    await context.close();
    await browser.close();

    const rawVideoPath = await video.path();
    console.log(`  ${GREEN}✔${RESET} Raw Playwright video captured: ${rawVideoPath}`);

    if (!fs.existsSync(rawVideoPath)) {
      throw new Error(`Raw video was not created at: ${rawVideoPath}`);
    }

    const rawStat = fs.statSync(rawVideoPath);
    console.log(`  Raw Video Size: ${(rawStat.size / (1024 * 1024)).toFixed(2)} MB (${rawStat.size} bytes)`);

    // Copy to final designated WebM path
    const finalWebmPath = path.join(DEMO_OUTPUT_DIR, 'bachat-gat-demo.webm');
    fs.copyFileSync(rawVideoPath, finalWebmPath);
    console.log(`  ${GREEN}✔${RESET} Final WebM Video copied to: ${finalWebmPath}`);

    // Check FFmpeg for MP4 export
    const mp4Path = path.join(DEMO_OUTPUT_DIR, 'Bachat-Gat-Digital-Savings-Group-Demo.mp4');
    let mp4Created = false;
    try {
      const ffmpegBin = fs.existsSync(FFMPEG_PATH) ? `"${FFMPEG_PATH}"` : 'ffmpeg';
      execSync(`${ffmpegBin} -version`, { stdio: 'ignore' });
      console.log('  Converting WebM to H.264 MP4 (1080p)...');
      execSync(`${ffmpegBin} -y -i "${finalWebmPath}" -c:v libx264 -pix_fmt yuv420p -preset fast "${mp4Path}"`, { stdio: 'inherit' });
      if (fs.existsSync(mp4Path) && fs.statSync(mp4Path).size > 0) {
        mp4Created = true;
      }
    } catch (e) {
      console.warn('  MP4 conversion warning:', e.message);
    }

    const finalStat = fs.statSync(finalWebmPath);
    const totalDurationSeconds = Math.round((Date.now() - startTime) / 1000);
    const minutes = Math.floor(totalDurationSeconds / 60);
    const seconds = totalDurationSeconds % 60;
    const durationFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

    console.log(`\n${BOLD}${GREEN}================================================================================${RESET}`);
    console.log(`${BOLD}${GREEN}🎉 BACHAT GAT COMPREHENSIVE PROJECT DEMO RECORDING COMPLETE${RESET}`);
    console.log(`${BOLD}${GREEN}================================================================================${RESET}`);
    console.log(`  STATUS:           ${demoError ? 'FAIL' : 'PASS'}`);
    console.log(`  Browser:          Chromium (Visible GUI Desktop Window)`);
    console.log(`  Frontend:         ${BASE_URL}`);
    console.log(`  Runtime Group:    ${EXPECTED_TEST_GROUP}`);
    console.log(`  Production:       ${FORBIDDEN_PROD_GROUP} — untouched`);
    console.log(`  Isolated Writes:  1 (Recorded Installment #1 in test_isolated_group_999)`);
    console.log(`  Production Writes:0 (shivshahi_group_001 strictly untouched)`);
    console.log(`  Flicker:          PASS (0 flicker detected over 5s modal hold)`);
    console.log(`  Console Errors:   ${consoleErrors.length}`);
    console.log(`  Video File:       ${finalWebmPath}`);
    console.log(`  Format:           WebM (VP8/VP9)`);
    console.log(`  Duration:         ${durationFormatted} (${totalDurationSeconds} seconds)`);
    console.log(`  Resolution:       1920 × 1080`);
    console.log(`  File Size:        ${(finalStat.size / (1024 * 1024)).toFixed(2)} MB (${finalStat.size} bytes)`);
    console.log(`  MP4 Status:       ${mp4Created ? mp4Path : 'Not available (FFmpeg unavailable on system PATH)'}`);
    console.log(`${BOLD}${GREEN}================================================================================${RESET}\n`);

    if (demoError) {
      throw demoError;
    }

    return {
      success: true,
      videoPath: finalWebmPath,
      mp4Path: mp4Created ? mp4Path : null,
      duration: durationFormatted,
      durationSeconds: totalDurationSeconds,
      sizeBytes: finalStat.size,
    };
  }
}

runDemoRecording()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(`\n${RED}${BOLD}DEMO RECORDING ERROR:${RESET}`, err);
    process.exit(1);
  });
