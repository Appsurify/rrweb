import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Builder, By, until, type WebDriver } from "selenium-webdriver";
import { Options as ChromeOptions } from "selenium-webdriver/chrome";

// The only Appsurify TestMap import a consumer needs in their tests:
import { attach } from "@appsurify-testmap/rrweb-selenium-plugin";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..", "app");
const indexUrl = pathToFileURL(join(appDir, "index.html")).href;
const aboutUrl = pathToFileURL(join(appDir, "about.html")).href;

describe("Demo App", () => {
  let driver: WebDriver;

  beforeAll(async () => {
    const options = new ChromeOptions().addArguments(
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
