import { test, expect } from '@playwright/test';

// Dismiss the support popup before every test so it doesn't block clicks.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('support_popup_shown', '1');
  });
  // Mock lobby fetch so room browser tests don't depend on a live server.
  await page.route('**/parties/lobby/main', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/');
});

test('page loads — logo and subtitle visible', async ({ page }) => {
  await expect(page.getByAltText('Madness Arena')).toBeVisible();
  await expect(page.getByText('WASD or mouse to move')).toBeVisible();
});

test('page title is set', async ({ page }) => {
  await expect(page).toHaveTitle(/Madness Arena|Wizard Arena/i);
});

test('renders all 12 character cards', async ({ page }) => {
  const chars = [
    'Kael', 'Ignis', 'Brazok', 'Zarak', 'Stonehide', 'Thornback',
    'Shade', 'Runt', 'Murkus', 'Elder Rex', 'Kestrel', 'Velox',
  ];
  for (const name of chars) {
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  }
});

test('Kael (blue_wizard) is selected by default', async ({ page }) => {
  const kael = page.locator('button.char-pick', { hasText: 'Kael' });
  await expect(kael).toHaveClass(/active/);
});

test('clicking a character activates it and deactivates the previous', async ({ page }) => {
  const kael = page.locator('button.char-pick', { hasText: 'Kael' });
  const ignis = page.locator('button.char-pick', { hasText: 'Ignis' });

  await expect(kael).toHaveClass(/active/);
  await ignis.click();
  await expect(ignis).toHaveClass(/active/);
  await expect(kael).not.toHaveClass(/active/);
});

test('name input is present and accepts text', async ({ page }) => {
  const input = page.getByPlaceholder('Enter your name...');
  await expect(input).toBeVisible();
  await input.fill('TestPlayer');
  await expect(input).toHaveValue('TestPlayer');
});

test('name input enforces 16 character limit', async ({ page }) => {
  const input = page.getByPlaceholder('Enter your name...');
  await input.fill('A'.repeat(20));
  const value = await input.inputValue();
  expect(value.length).toBeLessThanOrEqual(16);
});

test('submitting empty name shows error', async ({ page }) => {
  await page.getByRole('button', { name: /Enter Wizard Arena/i }).click();
  await expect(page.getByText('Please enter a name.')).toBeVisible();
});

test('submitting a blocked name shows error', async ({ page }) => {
  await page.getByPlaceholder('Enter your name...').fill('fuck');
  await page.getByRole('button', { name: /Enter Wizard Arena/i }).click();
  await expect(page.getByText('Please choose a different name.')).toBeVisible();
});

test('clearing name after error hides the error message', async ({ page }) => {
  const input = page.getByPlaceholder('Enter your name...');
  await page.getByRole('button', { name: /Enter Wizard Arena/i }).click();
  await expect(page.getByText('Please enter a name.')).toBeVisible();
  await input.fill('ValidName');
  await expect(page.locator('.name-error')).not.toBeVisible();
});

test('valid name navigates to room browser', async ({ page }) => {
  await page.getByPlaceholder('Enter your name...').fill('Warrior');
  await page.getByRole('button', { name: /Enter Wizard Arena/i }).click();
  await expect(page.getByText('Choose a Room')).toBeVisible();
});

test('leaderboard link is visible and points to /leaderboard', async ({ page }) => {
  const link = page.getByRole('link', { name: /Leaderboard/i });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/leaderboard');
});

test('support link is visible and points to /donate', async ({ page }) => {
  const link = page.getByRole('link', { name: /Support/i });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/donate');
});

test('support popup can be dismissed with Close button', async ({ page }) => {
  // Fresh page without the sessionStorage suppression
  const fresh = await page.context().newPage();
  await fresh.route('**/parties/lobby/main', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await fresh.goto('/');
  // Popup shows after 1.5s
  await expect(fresh.getByText('SUPPORT THE ARENA')).toBeVisible({ timeout: 5000 });
  await fresh.getByRole('button', { name: /Close/i }).click();
  await expect(fresh.getByText('SUPPORT THE ARENA')).not.toBeVisible();
  await fresh.close();
});

test('donation QR codes are present on select screen', async ({ page }) => {
  await expect(page.getByAltText('PIX QR Code').first()).toBeVisible();
  await expect(page.getByAltText('Wise QR Code').first()).toBeVisible();
});
