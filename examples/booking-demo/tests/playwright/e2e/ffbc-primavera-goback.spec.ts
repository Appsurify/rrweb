import { test, expect } from '@appsurify-testmap/rrweb-playwright-plugin';

// ── Home page ──────────────────────────────────────────────────────────────

test('go to Primavera Century from top menu and return home', async ({ page }) => {
  await page.goto('https://ffbc.org/');

  const topMenuPrimaveraLink = page
    .getByLabel('Main')
    .getByRole('link', { name: 'Primavera Century', exact: true });

  await expect(topMenuPrimaveraLink).toBeVisible();
  await topMenuPrimaveraLink.click();

  await expect(page).toHaveURL(/\/primavera\/$/);

  await page.goBack();

  await expect(page).toHaveURL(/^https:\/\/ffbc\.org\/?$/);
});

test('home page main navigation links are visible', async ({ page }) => {
  await page.goto('https://ffbc.org/');

  const nav = page.getByLabel('Main');

  for (const name of ['About Us', 'Rides', 'Membership', 'Primavera Century', 'Race Team']) {
    await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
  }
});

test('home page Log in link is visible in header', async ({ page }) => {
  await page.goto('https://ffbc.org/');

  await expect(page.getByRole('link', { name: 'Log in' }).first()).toBeVisible();
});

test('home page Contact Us link is visible', async ({ page }) => {
  await page.goto('https://ffbc.org/');

  await expect(page.getByRole('link', { name: 'Contact Us' })).toBeVisible();
});

test('home page footer Terms of Use and Privacy links are visible', async ({ page }) => {
  await page.goto('https://ffbc.org/');

  await expect(page.getByRole('link', { name: 'Terms of Use' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Privacy' })).toBeVisible();
});

test('About Us submenu expands and shows Join Us link', async ({ page }) => {
  await page.goto('https://ffbc.org/');

  const aboutUs = page.getByLabel('Main').getByRole('link', { name: 'About Us', exact: true });
  await aboutUs.hover();

  await expect(page.getByRole('link', { name: 'Join Us' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Club Events' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Club Contacts' })).toBeVisible();
});

test('Rides submenu expands and shows Ride Calendar link', async ({ page }) => {
  await page.goto('https://ffbc.org/');

  await page.getByLabel('Main').getByRole('link', { name: 'Rides', exact: true }).hover();

  await expect(page.getByRole('link', { name: 'Ride Calendar' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ride Information and Policies' })).toBeVisible();
});

test('Membership submenu expands and shows Member Login link', async ({ page }) => {
  await page.goto('https://ffbc.org/');

  await page.getByLabel('Main').getByRole('link', { name: 'Membership', exact: true }).hover();

  await expect(page.getByRole('link', { name: /Member Login/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Membership Application/i })).toBeVisible();
});

// ── Primavera Century page ──────────────────────────────────────────────────

test('Primavera Century page loads and shows event date', async ({ page }) => {
  await page.goto('https://ffbc.org/primavera/');

  await expect(page).toHaveURL(/\/primavera\//);
  await expect(page.getByText(/April/i)).toBeVisible();
});

test('Primavera page Registration link is visible', async ({ page }) => {
  await page.goto('https://ffbc.org/primavera/');

  await expect(page.getByRole('link', { name: 'Registration' })).toBeVisible();
});

test('Primavera page Routes link is visible', async ({ page }) => {
  await page.goto('https://ffbc.org/primavera/');

  await expect(page.getByRole('link', { name: 'Routes' })).toBeVisible();
});

test('Primavera page FAQs link is visible', async ({ page }) => {
  await page.goto('https://ffbc.org/primavera/');

  await expect(page.getByRole('link', { name: 'FAQs' })).toBeVisible();
});

test('Primavera page Volunteers link is visible', async ({ page }) => {
  await page.goto('https://ffbc.org/primavera/');

  await expect(page.getByRole('link', { name: 'Volunteers' })).toBeVisible();
});

test('Primavera page Sponsors link is visible', async ({ page }) => {
  await page.goto('https://ffbc.org/primavera/');

  await expect(page.getByRole('link', { name: 'Sponsors' })).toBeVisible();
});

test('Primavera page Travelogue link is visible', async ({ page }) => {
  await page.goto('https://ffbc.org/primavera/');

  await expect(page.getByRole('link', { name: 'Travelogue' })).toBeVisible();
});

test('Primavera page Giving Back link is visible', async ({ page }) => {
  await page.goto('https://ffbc.org/primavera/');

  await expect(page.getByRole('link', { name: 'Giving Back' })).toBeVisible();
});

test('Primavera page contact email link is visible', async ({ page }) => {
  await page.goto('https://ffbc.org/primavera/');

  await expect(page.getByRole('link', { name: /primavera@ffbc\.org/i })).toBeVisible();
});

test('Primavera page Photo and Videos link is visible', async ({ page }) => {
  await page.goto('https://ffbc.org/primavera/');

  await expect(page.getByRole('link', { name: 'Photo and Videos' })).toBeVisible();
});

test('Primavera page Registered Riders link is visible', async ({ page }) => {
  await page.goto('https://ffbc.org/primavera/');

  await expect(page.getByRole('link', { name: 'Registered Riders' })).toBeVisible();
});

test('Primavera page Clothing link is visible', async ({ page }) => {
  await page.goto('https://ffbc.org/primavera/');

  await expect(page.getByRole('link', { name: 'Clothing' }).first()).toBeVisible();
});

test('navigate from Primavera page to Transfer Ride Registration', async ({ page }) => {
  await page.goto('https://ffbc.org/primavera/');

  const link = page.getByRole('link', { name: 'Transfer Ride Registration' });
  await expect(link).toBeVisible();
  await link.click();

  await expect(page).not.toHaveURL(/^https:\/\/ffbc\.org\/?$/);
});

test('navigate from Primavera page back to home via Home nav link', async ({ page }) => {
  await page.goto('https://ffbc.org/primavera/');

  await page.getByLabel('Main').getByRole('link', { name: 'Home', exact: true }).click();

  await expect(page).toHaveURL(/^https:\/\/ffbc\.org\/?$/);
});
