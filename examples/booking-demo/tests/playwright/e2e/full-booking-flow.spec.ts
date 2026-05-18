import { test, expect } from '@appsurify-testmap/rrweb-playwright-plugin';

test.describe('Book Deluxe Sea View Suite', () => {
  test('completes the full booking flow', async ({ page }) => {
    // Navigate to the site
    await page.goto('https://appsurify.github.io/modern-seaside-stay/');
    // NOTE: Checked out (Meta + FullSnapshot)

    // Click "Book Your Stay" on the landing page
    await page.getByRole('link', { name: /book your stay/i }).first().click();

    // NOTE: Checked out (Meta + FullSnapshot) REASON: Next page (navigation)
    // Click the "Select" button that matches the given element
    await page
      .locator('button.inline-flex.items-center.justify-center')
      .filter({ hasText: 'Select' })
      .first()
      .click();

    // NOTE: Try don't if possible Checked out (Meta + FullSnapshot) REASON: big scroll to page bottom
    // Continue to guest information
    await page.getByRole('button', { name: /continue/i }).click();

    // NOTE: Checked out (Meta + FullSnapshot) REASON: Because changing step (like tabs)
    // Guest information
    await page.locator('input[placeholder*="First Name"], input[name="firstName"]').fill('Derek');
    await page.locator('input[placeholder*="Last Name"], input[name="lastName"]').fill('Choy');
    await page.locator('input[placeholder*="Email"], input[name="email"]').fill('test@test.com');
    await page.locator('input[placeholder*="Phone"], input[name="phone"]').fill('1234');
    await page.locator('input[placeholder*="Address"], input[name="address"]').fill('Test');
    await page.locator('input[placeholder*="City"], input[name="city"]').fill('Test');
    await page.locator('input[placeholder*="Zip Code"], input[name="zipCode"]').fill('12345');
    await page.locator('input[placeholder*="Country"], input[name="country"]').fill('Test');

    // NOTE: Not required but maybe Checked out (Meta + FullSnapshot) REASON: Big scroll to page bottom
    // Payment information
    await page.locator('input[placeholder*="Name on Card"], input[name="cardName"]').fill('Derek Choy');
    await page.locator('input[placeholder*="Card Number"], input[name="cardNumber"]').fill('1234');
    await page.locator('input[placeholder*="Expiry Date"], input[name="cardExpiry"]').fill('10/30');
    await page.locator('input[placeholder*="CVC"], input[name="cardCvc"]').fill('123');

    // Review & Confirm
    await page.getByRole('button', { name: /review & confirm/i }).click();

    // NOTE: Checked out (Meta + FullSnapshot) REASON: Because changing step (like tabs)
    // Confirm booking
    await page.getByRole('button', { name: /confirm booking/i }).click();

    // NOTE: Checked out (Meta + FullSnapshot)  REASON: Because rerender form
    // Assert booking success (adjust the text to match the actual success message)
    await expect(
      page.getByText(/booking confirmed|thank you for your booking|reservation complete/i).first()
    ).toBeVisible();
  });
});
