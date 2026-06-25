// Selenium port of tests/playwright/e2e/goback-snapshot.spec.ts
// Repro for "last page lost on goBack": after navigate().back() the report must
// contain a FullSnapshot for the post-goBack (home) page, as the LAST snapshot.
const assert = require("node:assert/strict");
const {
  makeDriver,
  By,
  navLinkByName,
  waitVisible,
  waitUrl,
  textByName,
} = require("../lib/driver.cjs");

const HOME = "https://appsurify.github.io/modern-seaside-stay/";

describe("goBack snapshot capture", function () {
  this.timeout(90000);
  let driver;

  before(async function () {
    this.timeout(180000);
    driver = await makeDriver();
  });
  after(async function () {
    if (driver) await driver.quit();
  });

  it("captures the page state after navigate().back() — quick assertion", async function () {
    await driver.get(HOME);
    await waitVisible(driver, textByName("seaside"));

    await (await driver.findElement(navLinkByName("apartments"))).click();
    await waitUrl(driver, /\/apartments/);

    await driver.navigate().back();
    await waitUrl(driver, /\/modern-seaside-stay\/?($|[?#])/);
    assert.match(await driver.getCurrentUrl(), /modern-seaside-stay/);
  });

  it("captures the page state after navigate().back() — no assertion after", async function () {
    await driver.get(HOME);
    await waitVisible(driver, textByName("seaside"));

    await (await driver.findElement(navLinkByName("apartments"))).click();
    await waitUrl(driver, /\/apartments/);

    await driver.navigate().back(); // nothing after — minimal window
  });

  it("captures the page state after a fast back-to-back navigation", async function () {
    await driver.get(HOME);
    await waitVisible(driver, textByName("seaside"));

    await (await driver.findElement(navLinkByName("apartments"))).click();
    await waitUrl(driver, /\/apartments/);

    // No settle wait before back — maximally widen the capture race window.
    await driver.navigate().back();
  });
});
