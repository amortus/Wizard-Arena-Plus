import { test, expect } from '@playwright/test';

const mockEntries = [
  { name: 'Warrior', character: 'blue_wizard', level: 15, wave: 22, score: 4800, ts: Date.now(), country: 'BR' },
  { name: 'Mage',    character: 'fire_wizard',  level: 10, wave: 14, score: 2100, ts: Date.now(), country: 'US' },
  { name: 'Rogue',   character: 'shadow_wizard', level:  7, wave:  9, score:  900, ts: Date.now() },
];

async function mockLeaderboard(page: import('@playwright/test').Page, entries: object[]) {
  await page.route('**/parties/main/main', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ entries }),
    }),
  );
}

// ── Page structure ──────────────────────────────────────────────────────────

test('leaderboard page loads with correct heading', async ({ page }) => {
  await mockLeaderboard(page, []);
  await page.goto('/leaderboard');
  await expect(page.getByRole('heading', { name: /Arena Leaderboard/i })).toBeVisible();
});

test('subtitle describes the leaderboard', async ({ page }) => {
  await mockLeaderboard(page, []);
  await page.goto('/leaderboard');
  await expect(page.getByText(/best score per wizard/i)).toBeVisible();
});

test('logo is visible', async ({ page }) => {
  await mockLeaderboard(page, []);
  await page.goto('/leaderboard');
  await expect(page.getByAltText('Madness Arena')).toBeVisible();
});

test('Back to Arena link navigates to home', async ({ page }) => {
  await mockLeaderboard(page, []);
  await page.goto('/leaderboard');
  const back = page.getByRole('link', { name: /Back to Arena/i });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page).toHaveURL('/');
});

// ── Empty state ─────────────────────────────────────────────────────────────

test('shows empty state when no entries', async ({ page }) => {
  await mockLeaderboard(page, []);
  await page.goto('/leaderboard');
  await expect(page.getByText(/No survivors yet/i)).toBeVisible();
});

// ── Table rendering ─────────────────────────────────────────────────────────

test('table column headers are visible', async ({ page }) => {
  await mockLeaderboard(page, mockEntries);
  await page.goto('/leaderboard');
  const head = page.locator('.lb-table-head');
  await expect(head.getByText('#')).toBeVisible();
  await expect(head.getByText('Wizard', { exact: true })).toBeVisible();
  await expect(head.getByText('Level', { exact: true })).toBeVisible();
  await expect(head.getByText('Wave', { exact: true })).toBeVisible();
  await expect(head.getByText('Score', { exact: true })).toBeVisible();
});

test('renders entry rows for each player', async ({ page }) => {
  await mockLeaderboard(page, mockEntries);
  await page.goto('/leaderboard');
  await expect(page.getByText('Warrior')).toBeVisible();
  await expect(page.getByText('Mage')).toBeVisible();
  await expect(page.getByText('Rogue')).toBeVisible();
});

test('shows rank numbers starting from #1', async ({ page }) => {
  await mockLeaderboard(page, mockEntries);
  await page.goto('/leaderboard');
  await expect(page.getByText('#1')).toBeVisible();
  await expect(page.getByText('#2')).toBeVisible();
  await expect(page.getByText('#3')).toBeVisible();
});

test('shows level values', async ({ page }) => {
  await mockLeaderboard(page, mockEntries);
  await page.goto('/leaderboard');
  await expect(page.getByText('L15')).toBeVisible();
  await expect(page.getByText('L10')).toBeVisible();
});

test('shows wave values', async ({ page }) => {
  await mockLeaderboard(page, mockEntries);
  await page.goto('/leaderboard');
  await expect(page.getByText('W22')).toBeVisible();
  await expect(page.getByText('W14')).toBeVisible();
});

test('shows score values', async ({ page }) => {
  await mockLeaderboard(page, mockEntries);
  await page.goto('/leaderboard');
  await expect(page.getByText('4800')).toBeVisible();
  await expect(page.getByText('2100')).toBeVisible();
});

test('entries are ordered by score descending', async ({ page }) => {
  // Feed reversed order — dedup/sort should fix it
  await mockLeaderboard(page, [...mockEntries].reverse());
  await page.goto('/leaderboard');
  const rows = page.locator('.lb-table-row');
  const first = await rows.first().textContent();
  expect(first).toContain('Warrior'); // highest score
});

test('deduplicates same name+character and keeps best score', async ({ page }) => {
  await mockLeaderboard(page, [
    { name: 'Hunter', character: 'blue_wizard', level: 5, wave: 6, score: 500, ts: Date.now() },
    { name: 'Hunter', character: 'blue_wizard', level: 8, wave: 10, score: 900, ts: Date.now() },
  ]);
  await page.goto('/leaderboard');
  // Should only show one row for Hunter
  const rows = page.locator('.lb-table-row', { hasText: 'Hunter' });
  await expect(rows).toHaveCount(1);
  // That row should show the higher score
  await expect(rows).toContainText('900');
});

test('server error shows empty state gracefully', async ({ page }) => {
  await page.route('**/parties/main/main', (route) =>
    route.fulfill({ status: 500, body: 'Internal Server Error' }),
  );
  await page.goto('/leaderboard');
  await expect(page.getByText(/No survivors yet/i)).toBeVisible({ timeout: 10_000 });
});

test('loading state is shown initially', async ({ page }) => {
  // Delay the response to observe the loading state
  await page.route('**/parties/main/main', async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ entries: [] }),
    });
  });
  await page.goto('/leaderboard');
  await expect(page.getByText('Loading...')).toBeVisible();
});
