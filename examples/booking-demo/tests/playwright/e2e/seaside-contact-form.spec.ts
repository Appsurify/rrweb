// e2e/2-booking-demo/seaside-contact-form.spec.ts
import { test, expect } from '@appsurify-testmap/rrweb-playwright-plugin';

test.describe('Modern Seaside Stay - Contact form', () => {
  test('fills and submits the contact form', async ({ page }) => {
    // Navigate to the site
    await page.goto('https://appsurify.github.io/modern-seaside-stay/');

    // Go to the Contact section/page
    await page.getByRole('link', { name: /contact/i }).first().click();

    // Fill in the contact form fields
    await page.locator('input[name="name"], input[placeholder*="Full Name"]').fill('Derek Choy');
    await page.locator('input[name="email"], input[placeholder*="Email"]').fill('test@test');
    await page.locator('input[name="phone"], input[placeholder*="Phone Number"]').fill('2345');
    await page.locator('input[name="subject"], input[placeholder*="Subject"]').fill('Test');

    // Add "Test" to the Message box
    await page
      .locator('textarea[name="message"], textarea[placeholder*="Message"], textarea')
      .fill('Test');

    // Click the "Send Message" button
    await page.getByRole('button', { name: /send message/i }).click();

    // Optional: Assert some success/validation state if the UI shows it
    // await expect(page.getByText(/thank you|message sent|we will get back/i)).toBeVisible();
  });
});
