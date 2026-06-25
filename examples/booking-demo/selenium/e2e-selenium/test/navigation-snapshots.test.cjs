// Selenium port of tests/playwright/e2e/navigation-snapshots.spec.ts
// Exercises multiple SPA route changes (navbar clicks, same document) — rrweb's
// NavigationManager should emit a META + FullSnapshot per route.
const assert = require("node:assert/strict");
const {
  makeDriver,
  navLinkByName,
  waitVisible,
  waitUrl,
  textByName,
} = require("../lib/driver.cjs");

const HOME = "https://appsurify.github.io/modern-seaside-stay/";

describe("Navigation Snapshot Validation", function () {
  this.timeout(90000);
  let driver;

  before(async function () {
    this.timeout(180000);
    driver = await makeDriver();
  });
  after(async function () {
    if (driver) await driver.quit();
  });

  it("produces snapshots across multiple SPA navigations", async function () {
    await driver.get(HOME);
    await waitVisible(driver, textByName("seaside"));

    const steps = [
      ["apartments", /\/apartments/],
      ["amenities", /\/amenities/],
      ["gallery", /\/gallery/],
      ["contact", /\/contact/],
      ["home", /\/modern-seaside-stay\/?($|[?#])/],
    ];

    for (const [name, urlRe] of steps) {
      await (await driver.findElement(navLinkByName(name))).click();
      await waitUrl(driver, urlRe);
    }

    assert.match(await driver.getCurrentUrl(), /modern-seaside-stay/);
  });
});
