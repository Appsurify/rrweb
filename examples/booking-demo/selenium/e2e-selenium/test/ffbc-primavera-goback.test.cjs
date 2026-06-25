// Selenium port of tests/playwright/e2e/ffbc-primavera-goback.spec.ts
// ffbc.org is a real multi-page site: nav-link clicks are FULL-page navigations
// (exercising the self-healing poll) and goBack returns home. A representative
// subset of the Playwright suite covering each distinct recording behaviour.
const assert = require("node:assert/strict");
const { makeDriver, By, until, waitVisible, waitUrl } = require("../lib/driver.cjs");

const HOME = "https://ffbc.org/";
const PRIMAVERA = "https://ffbc.org/primavera/";

// A link inside the main <nav aria-label="Main"> by exact text.
const mainNavLink = (name) =>
  By.xpath(`//*[@aria-label='Main']//a[normalize-space(.)=${lit(name)}]`);
const anyLink = (name) => By.xpath(`//a[normalize-space(.)=${lit(name)}]`);
function lit(s) {
  return s.includes("'") ? `concat('${s.split("'").join("',\"'\",'")}')` : `'${s}'`;
}

describe("ffbc.org navigation + goBack", function () {
  this.timeout(90000);
  let driver;

  before(async function () {
    this.timeout(180000);
    driver = await makeDriver();
  });
  after(async function () {
    if (driver) await driver.quit();
  });

  it("goes to Primavera Century from the top menu and returns home (goBack)", async function () {
    await driver.get(HOME);
    const link = await waitVisible(driver, mainNavLink("Primavera Century"));
    await link.click(); // full-page navigation (link click)
    await waitUrl(driver, /\/primavera\/?$/);

    await driver.navigate().back();
    await waitUrl(driver, /^https:\/\/ffbc\.org\/?$/);
    assert.match(await driver.getCurrentUrl(), /^https:\/\/ffbc\.org\/?$/);
  });

  it("home page main navigation links are visible", async function () {
    await driver.get(HOME);
    for (const name of ["About Us", "Rides", "Membership", "Primavera Century", "Race Team"]) {
      await waitVisible(driver, mainNavLink(name));
    }
  });

  it("About Us submenu expands on hover and shows Join Us", async function () {
    await driver.get(HOME);
    const aboutUs = await waitVisible(driver, mainNavLink("About Us"));
    await driver.actions({ bridge: true }).move({ origin: aboutUs }).perform();
    await driver.wait(until.elementLocated(anyLink("Join Us")), 15000);
  });

  it("Primavera Century page loads and shows Registration", async function () {
    await driver.get(PRIMAVERA);
    await waitUrl(driver, /\/primavera\//);
    await waitVisible(driver, anyLink("Registration"));
  });

  it("navigates from Primavera to another section via a top-nav link click", async function () {
    await driver.get(PRIMAVERA);
    // A top-nav link click is a full-page navigation away from /primavera/
    // (exercises the self-healing poll). Uses the stable site header rather than
    // a page-specific link that the live site may have removed.
    await (await waitVisible(driver, mainNavLink("Rides"))).click();
    await driver.wait(
      async () => !/\/primavera\/?$/.test(await driver.getCurrentUrl()),
      15000,
    );
    assert.doesNotMatch(await driver.getCurrentUrl(), /\/primavera\/?$/);
  });

  it("navigates from Primavera back home via the Home nav link", async function () {
    await driver.get(PRIMAVERA);
    await (await waitVisible(driver, mainNavLink("Home"))).click(); // full-page navigation
    await waitUrl(driver, /^https:\/\/ffbc\.org\/?$/);
    assert.match(await driver.getCurrentUrl(), /^https:\/\/ffbc\.org\/?$/);
  });
});
