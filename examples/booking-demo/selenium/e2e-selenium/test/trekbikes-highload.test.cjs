// Selenium port of tests/playwright/e2e/trekbikes-highload.spec.ts
// Heavy real-world homepage: dismiss the cookie consent, then assert header/brand
// links. Exercises recording on a large, asset-heavy page.
const assert = require("node:assert/strict");
const { makeDriver, By, until } = require("../lib/driver.cjs");

const BASE_URL = "https://www.trekbikes.com/us/en_US/";

describe("Trek Bikes - Homepage", function () {
  this.timeout(120000);
  let driver;

  before(async function () {
    this.timeout(180000);
    driver = await makeDriver();
  });
  after(async function () {
    if (driver) await driver.quit();
  });

  beforeEach(async function () {
    await driver.get(BASE_URL);
    await driver.sleep(1500);
    // Dismiss cookie/consent banner if present.
    const consent = await driver.findElements(
      By.css(
        '#CybotCookiebotDialogBodyButtonAccept, button[aria-label*="Accept"], button[id*="Accept"]',
      ),
    );
    if (consent.length) {
      try {
        await consent[0].click();
      } catch {
        /* banner may auto-dismiss */
      }
    }
  });

  it("Trek logo is visible and links to the homepage", async function () {
    const logo = await driver.wait(
      until.elementLocated(By.css('a[aria-label="Trek Bikes home page"]')),
      20000,
    );
    assert.ok(await logo.isDisplayed());
    assert.match(await logo.getAttribute("href"), /trekbikes\.com/);
  });

  it("Electra brand link points to the Electra site", async function () {
    const electra = await driver.wait(
      until.elementLocated(By.css('a[aria-label="Shop Electra"]')),
      20000,
    );
    assert.match(await electra.getAttribute("href"), /electra/);
  });
});
