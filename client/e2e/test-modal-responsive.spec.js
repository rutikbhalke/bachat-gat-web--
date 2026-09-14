import { test, expect } from '@playwright/test';

test.describe('Record Loan Payment Modal Responsiveness', () => {
  const viewports = [
    { name: '100% Zoom (1280x720)', width: 1280, height: 720 },
    { name: '125% Zoom equivalent (1024x576)', width: 1024, height: 576 },
    { name: '150% Zoom equivalent (853x480)', width: 853, height: 480 },
    { name: 'Small Laptop Viewport (1024x600)', width: 1024, height: 600 },
  ];

  for (const vp of viewports) {
    test(`Modal fits and is fully accessible at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // 1. Login
      await page.goto('/login');
      if (!page.url().includes('/dashboard')) {
        await page.click('button:has-text("Admin Login")');
        await page.fill('input[type="email"]', 'admin@bachatgat.com');
        await page.fill('input[type="password"]', 'Admin@123');
        await page.click('button[type="submit"]');
        await expect(page).toHaveURL(/.*dashboard/, { timeout: 30000 });
      }

      // 2. Go to Loans page
      await page.click('aside >> a[href="/loans"]');
      await expect(page).toHaveURL(/.*loans/, { timeout: 15000 });

      // 3. Open Record Payment Modal
      const payBtn = page.locator('button:has-text("Pay Installment")').first();
      await expect(payBtn).toBeVisible({ timeout: 15000 });
      await payBtn.click();

      // Check modal header
      const modalHeader = page.locator('h2:has-text("Record Loan Payment")');
      await expect(modalHeader).toBeVisible({ timeout: 10000 });

      const modal = page.locator('.app-modal');
      const modalBox = await modal.boundingBox();
      const scrollArea = page.locator('.app-modal-body > form > div').first();
      const submitBtn = page.locator('button:has-text("Record Payment")').last();
      const cancelBtn = page.locator('button:has-text("Cancel")').last();

      console.log(`[${vp.name}] Modal Box:`, modalBox);

      // Verify modal fits within visible viewport
      expect(modalBox.y).toBeGreaterThanOrEqual(0);
      expect(modalBox.y + modalBox.height).toBeLessThanOrEqual(vp.height + 1);

      // Verify bottom buttons are always visible and inside viewport
      await expect(cancelBtn).toBeVisible();
      await expect(submitBtn).toBeVisible();
      const submitBox = await submitBtn.boundingBox();
      console.log(`[${vp.name}] Submit Button Box:`, submitBox);
      expect(submitBox.y + submitBox.height).toBeLessThanOrEqual(vp.height + 1);

      // Verify top fields
      await expect(page.locator('label:has-text("Select Active Loan *")')).toBeVisible();

      // Scroll inside modal content area
      await scrollArea.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await page.waitForTimeout(200);

      // Verify lower fields are reachable
      await expect(page.locator('label:has-text("Payment Date")')).toBeVisible();
      await expect(page.locator('label:has-text("Payment Mode")')).toBeVisible();
      await expect(page.locator('label:has-text("Payment Remarks")')).toBeVisible();

      // Close modal
      await cancelBtn.click();
      await expect(modalHeader).not.toBeVisible();
    });
  }
});
