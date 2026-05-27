import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/donate');
});

test('donate page loads with correct heading', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /Support the Arena/i })).toBeVisible();
});

test('subtitle describes the donation purpose', async ({ page }) => {
  await expect(page.getByText(/Keep the game free/i)).toBeVisible();
});

test('logo is visible', async ({ page }) => {
  await expect(page.getByAltText('Wizard Arena Plus')).toBeVisible();
});

// ── PIX card ────────────────────────────────────────────────────────────────

test('PIX card is visible', async ({ page }) => {
  await expect(page.getByText('🇧🇷 PIX')).toBeVisible();
});

test('PIX QR code image is rendered', async ({ page }) => {
  await expect(page.getByAltText('PIX QR Code')).toBeVisible();
});

test('PIX card explains scan instruction', async ({ page }) => {
  await expect(page.getByText(/Escaneie com qualquer app/i)).toBeVisible();
});

// ── Wise card ────────────────────────────────────────────────────────────────

test('Wise card is visible', async ({ page }) => {
  await expect(page.getByText('💚 Wise')).toBeVisible();
});

test('Wise QR code image is rendered', async ({ page }) => {
  await expect(page.getByAltText('Wise QR Code')).toBeVisible();
});

test('Wise handle is displayed', async ({ page }) => {
  await expect(page.getByText('@alyssong10')).toBeVisible();
});

// ── Ko-fi card ───────────────────────────────────────────────────────────────

test('Ko-fi card is visible', async ({ page }) => {
  await expect(page.getByText('☕ Ko-fi')).toBeVisible();
});

test('Ko-fi button links to correct URL', async ({ page }) => {
  const link = page.getByRole('link', { name: /Buy me a coffee/i });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://ko-fi.com/wizardarenaplus');
});

test('Ko-fi button opens in new tab', async ({ page }) => {
  const link = page.getByRole('link', { name: /Buy me a coffee/i });
  await expect(link).toHaveAttribute('target', '_blank');
});

test('Ko-fi URL text is shown', async ({ page }) => {
  await expect(page.getByText('ko-fi.com/wizardarenaplus')).toBeVisible();
});

// ── Footer & navigation ──────────────────────────────────────────────────────

test('thank-you note is present', async ({ page }) => {
  await expect(page.getByText(/Thank you/i)).toBeVisible();
});

test('Back to Arena link navigates to home', async ({ page }) => {
  const back = page.getByRole('link', { name: /Back to Arena/i });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page).toHaveURL('/');
});
