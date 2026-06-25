const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");

// The only Appsurify TestMap import a consumer needs in their tests:
const { attach } = require("@appsurify-testmap/rrweb-selenium-plugin");

const appDir = path.join(__dirname, "..", "app");
const indexUrl = pathToFileURL(path.join(appDir, "index.html")).href;
const aboutUrl = pathToFileURL(path.join(appDir, "about.html")).href;

describe("Demo App", () => {
  let driver;

  beforeAll(async () => {
    const options = new chrome.Options().addArguments(
      "--headless=new",
      "--window-size=1280,800",
      "--no-sandbox",
    );
    // 👇 the ONE Appsurify TestMap line — wrap the driver you already build.
    driver = attach(await new Builder().forBrowser("chrome").setChromeOptions(options).build());
  });

  afterAll(async () => {
    if (driver) await driver.quit();
  });

  // ── From here down: ordinary Selenium tests. No recording code at all. ──

  it("increments the counter", async () => {
    await driver.get(indexUrl);
    await driver.findElement(By.id("inc")).click();
    await driver.findElement(By.id("inc")).click();
    await driver.wait(until.elementTextIs(driver.findElement(By.id("count")), "2"), 5000);
    expect(await driver.findElement(By.id("count")).getText()).toBe("2");
  });

  it("records a multi-page flow (home -> about)", async () => {
    await driver.get(indexUrl);
    await driver.findElement(By.id("inc")).click();

    // A driver navigation — the plugin re-injects rrweb on the new page.
    await driver.get(aboutUrl);
    await driver.findElement(By.id("name")).sendKeys("Appsurify TestMap");
    await driver.findElement(By.id("greet")).click();

    expect(await driver.findElement(By.id("message")).getText()).toMatch(/Appsurify TestMap/);
  });
});
