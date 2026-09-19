import { test, expect } from '@playwright/test';

test('successful activation persists and verifies after restart', async ({ page }) => {
  await page.route('**/api/license/activate', async (route) => {
    const request = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        valid: true,
        machineId: request.machineId,
        expiryDate: '2099-12-31',
        daysRemaining: 26766,
        message: 'Licence activated successfully.',
      }),
    });
  });
  await page.route('**/api/license/verify', async (route) => {
    const request = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        valid: true,
        machineId: request.machineId,
        expiryDate: '2099-12-31',
        daysRemaining: 26766,
        message: 'Licence verified successfully.',
      }),
    });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Licence expired' })).toBeVisible();
  await page.getByLabel('Licence key').fill('fixture-key');
  await page.getByRole('button', { name: 'Activate Licence' }).click();
  await expect(page.getByRole('heading', { name: 'Licence expired' })).toHaveCount(0);

  await page.reload();
  await expect(page.getByText('Verifying licence...')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Licence expired' })).toHaveCount(0);
  const stored = await page.evaluate(() => ({
    key: localStorage.getItem('license_activation_key'),
    expiry: localStorage.getItem('license_expiry'),
  }));
  expect(stored).toEqual({ key: 'fixture-key', expiry: '2099-12-31' });
});

test('invalid activation remains locked and does not persist the key', async ({ page }) => {
  await page.route('**/api/license/activate', (route) => route.fulfill({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, valid: false, message: 'The licence key is invalid or expired.' }),
  }));
  await page.goto('/');
  await page.getByLabel('Licence key').fill('invalid-key');
  await page.getByRole('button', { name: 'Activate Licence' }).click();
  await expect(page.getByRole('alert')).toContainText('invalid or expired');
  expect(await page.evaluate(() => localStorage.getItem('license_activation_key'))).toBeNull();
});

test('application locks after server verification reports an expired key', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('license_machine_id', 'EXPIRED-MACHINE');
    localStorage.setItem('license_activation_key', 'expired-key');
    localStorage.setItem('license_expiry', '2026-09-18');
  });
  await page.route('**/api/license/verify', (route) => route.fulfill({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, valid: false, message: 'The licence key is invalid or expired.' }),
  }));

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Licence expired' })).toBeVisible();
  await expect(page.getByTestId('machine-id')).toHaveText('EXPIRED-MACHINE');
});
