// 👇 the ONE Appsurify TestMap wiring line — registers recording hooks for this
// file's tests + a teardown that bundles the report ZIP.
import "@appsurify-testmap/rrweb-selenium-plugin/node-test";

import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, it, before, after } from "node:test";
import { Builder, By, until } from "selenium-webdriver";
// Native ESM (node:test) needs the explicit .js — selenium-webdriver has no `exports` map.
import chrome from "selenium-webdriver/chrome.js";

// The only other Appsurify TestMap import a consumer needs:
import { attach } from "@appsurify-testmap/rrweb-selenium-plugin";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..", "app");
const indexUrl = pathToFileURL(join(appDir, "index.html")).href;
const aboutUrl = pathToFileURL(join(appDir, "about.html")).href;

describe("Demo App", () => {
  let driver;

  before(async () => {
    const options = new chrome.Options().addArguments(
      "--headless=new",
      "--window-size=1280,800",
      "--no-sandbox",
    );
    // 👇 the ONE Appsurify TestMap line — wrap the driver you already build.
    driver = attach(await new Builder().forBrowser("chrome").setChromeOptions(options).build());
  });

  after(async () => {
    if (driver) await driver.quit();
  });

  // ── From here down: ordinary Selenium tests. No recording code at all. ──

  it("increments the counter", async () => {
    await driver.get(indexUrl);
    await driver.findElement(By.id("inc")).click();
    await driver.findElement(By.id("inc")).click();
    await driver.wait(until.elementTextIs(driver.findElement(By.id("count")), "2"), 5000);
    assert.equal(await driver.findElement(By.id("count")).getText(), "2");
  });

  it("records a multi-page flow (home -> about)", async () => {
    await driver.get(indexUrl);
    await driver.findElement(By.id("inc")).click();

    // A driver navigation — the plugin re-injects rrweb on the new page.
    await driver.get(aboutUrl);
    await driver.findElement(By.id("name")).sendKeys("Appsurify TestMap");
    await driver.findElement(By.id("greet")).click();

    assert.match(await driver.findElement(By.id("message")).getText(), /Appsurify TestMap/);
  });
});
