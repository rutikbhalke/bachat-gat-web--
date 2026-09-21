import { chromium } from 'playwright';

const TEST_GROUP = 'test_isolated_group_999';
const PROD_GROUP = 'shivshahi_group_001';

async function reproduce() {
  console.log('Starting delete error reproduction script...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  const consoleLogs = [];
  const networkErrors = [];

  page.on('console', msg => {
    const text = `[Console ${msg.type()}] ${msg.text()}`;
    consoleLogs.push(text);
    console.log(text);
  });

  page.on('pageerror', err => {
    const text = `[Page Error] ${err.message}\n${err.stack}`;
    consoleLogs.push(text);
    console.log(text);
  });

  page.on('response', resp => {
    if (resp.status() >= 400) {
      const text = `[Network Error] ${resp.status()} ${resp.url()}`;
      networkErrors.push(text);
      console.log(text);
    }
  });

  // 1. Log in as admin
  console.log('Logging in as admin...');
  await page.goto('http://localhost:3001/login');
  await page.waitForTimeout(500);

  const adminBtn = page.locator('button:has-text("Admin Login")');
  if (await adminBtn.isVisible()) {
    await adminBtn.click();
    await page.waitForTimeout(200);
  }

  await page.fill('input[type="email"]', 'admin@bachatgat.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  console.log('Logged in successfully.');

  // Create an isolated test member in test_isolated_group_999 with NO loan
  const testMember = await page.evaluate(async (gid) => {
    const { db, doc, setDoc, serverTimestamp } = await import('/src/config/firebase.js');
    const mid = `test_del_mem_${Date.now()}`;
    await setDoc(doc(db, 'users', mid), {
      id: mid,
      userId: mid,
      fullName: 'Test Delete Target',
      name: 'Test Delete Target',
      memberCode: `M-DEL-${Date.now().toString().slice(-4)}`,
      member_code: `M-DEL-${Date.now().toString().slice(-4)}`,
      email: `testdel${Date.now()}@example.com`,
      phone: '9876543210',
      groupId: gid,
      group_id: gid,
      monthlyShare: 1000,
      monthly_share: 1000,
      role: 'member',
      role_name: 'MEMBER',
      isActive: true,
      is_active: true,
      status: 'active',
      isDeleted: false,
      joinedDate: '2026-09-01',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { mid, name: 'Test Delete Target' };
  }, TEST_GROUP);

  console.log(`Created test member: ${testMember.mid}`);

  // Navigate directly to Member Details page
  console.log(`Navigating directly to /members/${testMember.mid}...`);
  await page.goto(`http://localhost:3001/members/${testMember.mid}`);
  await page.waitForSelector('h1', { timeout: 10000 });
  console.log(`Arrived at Member Details page: ${page.url()}`);
  await page.waitForTimeout(1000);

  // Check if Delete Member button exists and is visible
  const deleteBtn = page.locator('button:has-text("Delete Member")');
  const isDeleteBtnVisible = await deleteBtn.isVisible();
  console.log(`Delete Member button visible: ${isDeleteBtnVisible}`);

  if (!isDeleteBtnVisible) {
    console.log('Delete button is NOT visible! Dumping page text:');
    const bodyText = await page.innerText('body');
    console.log(bodyText.slice(0, 1000));
  } else {
    console.log('Clicking Delete Member button...');
    await deleteBtn.click();
    await page.waitForTimeout(600);

    // Look for confirmation popup/modal
    console.log('Checking for Confirmation Modal...');
    const confirmModal = page.locator('text=Delete Member?');
    await confirmModal.waitFor({ timeout: 5000 });
    console.log('Confirmation modal is visible!');

    // Click Confirm Delete in modal
    // The confirm button in the confirmation modal is button:has-text("Delete Member")
    const modalConfirmBtn = page.locator('button:has-text("Delete Member")').last();
    console.log('Clicking Confirm Delete button in modal...');
    await modalConfirmBtn.click();
    await page.waitForTimeout(3000);

    // Capture any error message on screen
    const popupError = await page.locator('.popup-modal, .error, .alert, [role="alert"]').allInnerTexts();
    console.log('Popup/Alert texts:', popupError);

    const bodyAfter = await page.innerText('body');
    console.log('Page text after delete attempt (snippet):');
    console.log(bodyAfter.split('\n').filter(l => l.includes('Error') || l.includes('Delete') || l.includes('Failed') || l.includes('Cannot') || l.includes('success')).join('\n'));
  }

  await browser.close();
}

reproduce().catch(err => {
  console.error('Reproduction failed:', err);
  process.exit(1);
});
