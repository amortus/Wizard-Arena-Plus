import { test, expect } from '@playwright/test';

async function goToBrowser(page: import('@playwright/test').Page, rooms: object[] = []) {
  await page.addInitScript(() => {
    sessionStorage.setItem('support_popup_shown', '1');
  });
  await page.route('**/parties/lobby/main', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rooms) }),
  );
  await page.goto('/');
  await page.getByPlaceholder('Enter your name...').fill('Tester');
  await page.getByRole('button', { name: /Enter Wizard Arena/i }).click();
  await expect(page.getByText('Choose a Room')).toBeVisible();
}

const mockRoom = {
  id: 'ROOM01',
  name: "Tester's Room",
  playerCount: 1,
  maxPlayers: 6,
  wave: 3,
  waveName: 'Goblins',
  hasPassword: false,
  createdAt: Date.now(),
  gameMode: 'arena',
};

const lockedRoom = {
  ...mockRoom,
  id: 'ROOM02',
  name: 'Secret Room',
  hasPassword: true,
  gameMode: 'arena',
};

const fullRoom = {
  ...mockRoom,
  id: 'ROOM03',
  name: 'Full Room',
  playerCount: 6,
  maxPlayers: 6,
  hasPassword: false,
};

// ── Layout & navigation ─────────────────────────────────────────────────────

test('browser shows Choose a Room heading', async ({ page }) => {
  await goToBrowser(page);
  await expect(page.getByText('Choose a Room')).toBeVisible();
});

test('browser has Refresh and Back buttons', async ({ page }) => {
  await goToBrowser(page);
  await expect(page.getByRole('button', { name: /Refresh/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Back/i })).toBeVisible();
});

test('Back button returns to character select', async ({ page }) => {
  await goToBrowser(page);
  await page.getByRole('button', { name: /Back/i }).click();
  await expect(page.getByText('Choose Your Wizard')).toBeVisible();
});

// ── Empty state ─────────────────────────────────────────────────────────────

test('empty room list shows friendly message', async ({ page }) => {
  await goToBrowser(page, []);
  await expect(page.getByText(/No active rooms/i)).toBeVisible();
});

// ── Room rows ───────────────────────────────────────────────────────────────

test('open room row shows name, player count and wave', async ({ page }) => {
  await goToBrowser(page, [mockRoom]);
  await expect(page.getByText("Tester's Room")).toBeVisible();
  await expect(page.getByText('1/6')).toBeVisible();
  await expect(page.getByText(/W3/)).toBeVisible();
});

test('open room shows Join button', async ({ page }) => {
  await goToBrowser(page, [mockRoom]);
  await expect(page.getByRole('button', { name: /Join/i }).first()).toBeVisible();
});

test('locked room shows lock icon', async ({ page }) => {
  await goToBrowser(page, [lockedRoom]);
  await expect(page.getByText('🔒')).toBeVisible();
});

test('locked room Join opens password prompt', async ({ page }) => {
  await goToBrowser(page, [lockedRoom]);
  await page.getByRole('button', { name: /Join/i }).first().click();
  await expect(page.getByPlaceholder('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'X', exact: true })).toBeVisible();
});

test('password prompt can be cancelled with X', async ({ page }) => {
  await goToBrowser(page, [lockedRoom]);
  await page.getByRole('button', { name: /Join/i }).first().click();
  await page.getByRole('button', { name: 'X', exact: true }).click();
  await expect(page.getByPlaceholder('Password')).not.toBeVisible();
});

test('full room shows FULL label instead of Join', async ({ page }) => {
  await goToBrowser(page, [fullRoom]);
  await expect(page.getByText('FULL', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Join/i })).not.toBeVisible();
});

test('castle mode room shows castle emoji', async ({ page }) => {
  await goToBrowser(page, [{ ...mockRoom, id: 'CAST01', gameMode: 'castle', name: 'Castle Game' }]);
  await expect(page.getByText('🏰').first()).toBeVisible();
});

test('moba mode room shows sword emoji', async ({ page }) => {
  await goToBrowser(page, [{ ...mockRoom, id: 'MOBA01', gameMode: 'moba', name: 'Moba Game' }]);
  await expect(page.getByText('🗡️').first()).toBeVisible();
});

// ── Create room form ─────────────────────────────────────────────────────────

test('Create Room button toggles the create form', async ({ page }) => {
  await goToBrowser(page);
  await page.getByRole('button', { name: /\+ Create Room/i }).click();
  await expect(page.getByPlaceholder('Room name...')).toBeVisible();
  await expect(page.getByRole('button', { name: /Cancel/i })).toBeVisible();
});

test('create form shows all four game mode options', async ({ page }) => {
  await goToBrowser(page);
  await page.getByRole('button', { name: /\+ Create Room/i }).click();
  await expect(page.locator('.rmc-label', { hasText: 'ARENA' })).toBeVisible();
  await expect(page.locator('.rmc-label', { hasText: 'CASTLE' })).toBeVisible();
  await expect(page.locator('.rmc-label', { hasText: 'CRYSTAL RUSH' })).toBeVisible();
  await expect(page.locator('.rmc-label', { hasText: 'A.R.A.M.' })).toBeVisible();
});

test('Arena mode is selected by default in create form', async ({ page }) => {
  await goToBrowser(page);
  await page.getByRole('button', { name: /\+ Create Room/i }).click();
  const arenaBtn = page.locator('.room-mode-card--arena');
  await expect(arenaBtn).toHaveClass(/active/);
});

test('clicking Castle mode activates it', async ({ page }) => {
  await goToBrowser(page);
  await page.getByRole('button', { name: /\+ Create Room/i }).click();
  await page.locator('.room-mode-card--castle').click();
  await expect(page.locator('.room-mode-card--castle')).toHaveClass(/active/);
  await expect(page.locator('.room-mode-card--arena')).not.toHaveClass(/active/);
});

test('create form has optional password field', async ({ page }) => {
  await goToBrowser(page);
  await page.getByRole('button', { name: /\+ Create Room/i }).click();
  await expect(page.getByPlaceholder('Password (optional)')).toBeVisible();
});

test('Create & Play button is visible in create form', async ({ page }) => {
  await goToBrowser(page);
  await page.getByRole('button', { name: /\+ Create Room/i }).click();
  await expect(page.getByRole('button', { name: /Create & Play/i })).toBeVisible();
});

test('Cancel hides the create form', async ({ page }) => {
  await goToBrowser(page);
  await page.getByRole('button', { name: /\+ Create Room/i }).click();
  await page.getByRole('button', { name: /Cancel/i }).click();
  await expect(page.getByPlaceholder('Room name...')).not.toBeVisible();
});

// ── Navigate to game ─────────────────────────────────────────────────────────

test('joining an open room transitions to game screen', async ({ page }) => {
  await goToBrowser(page, [mockRoom]);
  await page.getByRole('button', { name: /Join/i }).first().click();
  // Game component mounts — phaser container or connecting overlay should appear
  await expect(page.locator('#phaser-container, .connecting-overlay').first()).toBeVisible({ timeout: 10_000 });
});

test('Create & Play transitions to game screen', async ({ page }) => {
  await goToBrowser(page);
  await page.getByRole('button', { name: /\+ Create Room/i }).click();
  await page.getByRole('button', { name: /Create & Play/i }).click();
  await expect(page.locator('#phaser-container, .connecting-overlay').first()).toBeVisible({ timeout: 10_000 });
});
