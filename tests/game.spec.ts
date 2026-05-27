import { test, expect } from '@playwright/test';

// Helper: navigate through select → browser → game
async function launchGame(page: import('@playwright/test').Page, charName = 'Kael') {
  await page.addInitScript(() => {
    sessionStorage.setItem('support_popup_shown', '1');
  });

  // Mock lobby so we don't need a live PartyKit server
  await page.route('**/parties/lobby/main', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );

  // Mock the game WS room HTTP endpoint to prevent 502 noise (game still WS-connects separately)
  await page.route('**/parties/main/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"entries":[]}' }),
  );

  await page.goto('/');
  await page.locator('button.char-pick', { hasText: charName }).click();
  await page.getByPlaceholder('Enter your name...').fill('TestHero');
  await page.getByRole('button', { name: /Enter Wizard Arena/i }).click();
  await expect(page.getByText('Choose a Room')).toBeVisible();

  // Use Create & Play to jump straight into the game
  await page.getByRole('button', { name: /\+ Create Room/i }).click();
  await page.getByRole('button', { name: /Create & Play/i }).click();
}

// ── Game container ───────────────────────────────────────────────────────────

test('phaser container element mounts', async ({ page }) => {
  await launchGame(page);
  await expect(page.locator('#phaser-container')).toBeVisible({ timeout: 10_000 });
});

test('canvas element is created by Phaser', async ({ page }) => {
  await launchGame(page);
  // Phaser injects a <canvas> inside #phaser-container
  await expect(page.locator('#phaser-container canvas')).toBeVisible({ timeout: 15_000 });
});

// ── Connecting overlay ────────────────────────────────────────────────────────
// Without a live server the game shows "Connecting..." indefinitely.

test('connecting overlay is shown while waiting for server', async ({ page }) => {
  await launchGame(page);
  await expect(page.locator('.connecting-overlay')).toBeVisible({ timeout: 10_000 });
});

test('connecting overlay contains animated dots', async ({ page }) => {
  await launchGame(page);
  const overlay = page.locator('.connecting-overlay').first();
  await expect(overlay).toBeVisible({ timeout: 10_000 });
  // The animated dots are individual spans
  await expect(overlay.locator('.connecting-dot')).toHaveCount(3, { timeout: 5_000 });
});

// ── Game screen for all characters ───────────────────────────────────────────

const CHARACTERS = [
  'Kael', 'Ignis', 'Brazok', 'Zarak', 'Stonehide', 'Thornback',
  'Shade', 'Runt', 'Murkus', 'Elder Rex', 'Kestrel', 'Velox',
] as const;

for (const char of CHARACTERS) {
  test(`game mounts correctly with character ${char}`, async ({ page }) => {
    await launchGame(page, char);
    await expect(page.locator('#phaser-container')).toBeVisible({ timeout: 10_000 });
  });
}

// ── Game mode wiring ─────────────────────────────────────────────────────────

test('selecting Arena mode and entering game works', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('support_popup_shown', '1'));
  await page.route('**/parties/lobby/main', (r) => r.fulfill({ status: 200, body: '[]' }));
  await page.goto('/');
  await page.getByPlaceholder('Enter your name...').fill('ModeTest');
  await page.getByRole('button', { name: /Enter Wizard Arena/i }).click();
  await page.getByRole('button', { name: /\+ Create Room/i }).click();
  // Arena is default — just create & play
  await page.getByRole('button', { name: /Create & Play/i }).click();
  await expect(page.locator('#phaser-container')).toBeVisible({ timeout: 10_000 });
});

test('selecting Castle mode and entering game works', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('support_popup_shown', '1'));
  await page.route('**/parties/lobby/main', (r) => r.fulfill({ status: 200, body: '[]' }));
  await page.goto('/');
  await page.getByPlaceholder('Enter your name...').fill('CastleTest');
  await page.getByRole('button', { name: /Enter Wizard Arena/i }).click();
  await page.getByRole('button', { name: /\+ Create Room/i }).click();
  await page.locator('.room-mode-card--castle').click();
  await page.getByRole('button', { name: /Create & Play/i }).click();
  await expect(page.locator('#phaser-container')).toBeVisible({ timeout: 10_000 });
});

test('selecting MOBA mode and entering game works', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('support_popup_shown', '1'));
  await page.route('**/parties/lobby/main', (r) => r.fulfill({ status: 200, body: '[]' }));
  await page.goto('/');
  await page.getByPlaceholder('Enter your name...').fill('MobaTest');
  await page.getByRole('button', { name: /Enter Wizard Arena/i }).click();
  await page.getByRole('button', { name: /\+ Create Room/i }).click();
  await page.locator('.room-mode-card--moba').click();
  await page.getByRole('button', { name: /Create & Play/i }).click();
  await expect(page.locator('#phaser-container')).toBeVisible({ timeout: 10_000 });
});
