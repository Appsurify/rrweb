// Selenium port of tests/playwright/e2e/full-booking-flow.spec.ts
// Full multi-step booking flow on the modern-seaside-stay SPA.
const assert = require("node:assert/strict");
const {
  makeDriver,
  By,
  until,
  buttonByName,
  linkByName,
  textByName,
  waitVisible,
  fillFirst,
} = require("../lib/driver.cjs");

const HOME = "https://appsurify.github.io/modern-seaside-stay/";

describe("Book Deluxe Sea View Suite", function () {
  this.timeout(90000);
  let driver;

  before(async function () {
    this.timeout(180000);
    driver = await makeDriver();
  });
  after(async function () {
    if (driver) await driver.quit();
  });

  it("completes the full booking flow", async function () {
    await driver.get(HOME);

    // "Book Your Stay" on the landing page.
    await (await waitVisible(driver, linkByName("book your stay", { exact: false }))).click();

    // The "Select" button on a room card.
    const selectBtn = await waitVisible(
      driver,
      By.xpath("//button[contains(@class,'inline-flex')][contains(normalize-space(.),'Select')]"),
    );
    await selectBtn.click();

    // Continue to guest information.
    await (await waitVisible(driver, buttonByName("continue"))).click();

    // Guest information.
    await fillFirst(driver, ['input[name="firstName"]', 'input[placeholder*="First Name"]'], "Derek");
    await fillFirst(driver, ['input[name="lastName"]', 'input[placeholder*="Last Name"]'], "Choy");
    await fillFirst(driver, ['input[name="email"]', 'input[placeholder*="Email"]'], "test@test.com");
    await fillFirst(driver, ['input[name="phone"]', 'input[placeholder*="Phone"]'], "1234");
    await fillFirst(driver, ['input[name="address"]', 'input[placeholder*="Address"]'], "Test");
    await fillFirst(driver, ['input[name="city"]', 'input[placeholder*="City"]'], "Test");
    await fillFirst(driver, ['input[name="zipCode"]', 'input[placeholder*="Zip Code"]'], "12345");
    await fillFirst(driver, ['input[name="country"]', 'input[placeholder*="Country"]'], "Test");

    // Payment information.
    await fillFirst(driver, ['input[name="cardName"]', 'input[placeholder*="Name on Card"]'], "Derek Choy");
    await fillFirst(driver, ['input[name="cardNumber"]', 'input[placeholder*="Card Number"]'], "1234");
    await fillFirst(driver, ['input[name="cardExpiry"]', 'input[placeholder*="Expiry Date"]'], "10/30");
    await fillFirst(driver, ['input[name="cardCvc"]', 'input[placeholder*="CVC"]'], "123");

    // Review & Confirm.
    await (await waitVisible(driver, buttonByName("review & confirm"))).click();

    // Confirm booking.
    await (await waitVisible(driver, buttonByName("confirm booking"))).click();

    // Booking success.
    const success = await driver.wait(
      until.elementLocated(textByName("booking confirmed")),
      20000,
    );
    assert.ok(await success.isDisplayed());
  });
});
