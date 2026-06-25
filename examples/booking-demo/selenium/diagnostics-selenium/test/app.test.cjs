const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");

const { attach } = require("@appsurify-testmap/rrweb-selenium-plugin");

const appDir = path.join(__dirname, "..", "app");
const CONTENT_TYPES = { ".html": "text/html", ".css": "text/css" };

// A real HTTP origin (not file://) so same-origin <link> stylesheets are
// CSSOM-readable and rrweb can inline them — file:// is an opaque origin where
// CSSOM throws and the cross-origin fetch path never fires.
function startServer(dir) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent((req.url || "/").split("?")[0]);
      const file = path.join(dir, rel === "/" ? "index.html" : rel);
      fs.readFile(file, (err, buf) => {
        if (err) {
          res.statusCode = 404;
          res.end("not found");
          return;
        }
        res.setHeader("content-type", CONTENT_TYPES[path.extname(file)] || "text/plain");
        res.end(buf);
      });
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

describe("Diagnostics", function () {
  this.timeout(120000);
  let driver;
  let server;
  let base;

  before(async function () {
    this.timeout(180000); // Selenium Manager may cold-start/redownload the driver
    server = await startServer(appDir);
    base = `http://127.0.0.1:${server.address().port}/`;
    const options = new chrome.Options().addArguments(
      "--headless=new",
      "--window-size=1280,800",
      "--no-sandbox",
    );
    driver = attach(await new Builder().forBrowser("chrome").setChromeOptions(options).build());
  });

  after(async function () {
    if (driver) await driver.quit();
    if (server) await new Promise((r) => server.close(r));
  });

  // Problem 1a (segmentation) + Problem 2 (<link> stylesheet inlining over HTTP).
  it("segmentation multi-page via driver.get", async function () {
    await driver.get(base + "index.html");
    await driver.findElement(By.id("inc")).click();
    await driver.get(base + "about.html");
    await driver.findElement(By.id("name")).sendKeys("TestMap");
    await driver.findElement(By.id("greet")).click();
    assert.match(await driver.findElement(By.id("message")).getText(), /TestMap/);
  });

  // Problem 1b — destination reached by a LINK CLICK (full-page navigation NOT
  // routed through driver.get/navigate). The self-healing poll must re-inject
  // on the new document so the destination is still captured.
  it("captures destination reached via link click", async function () {
    await driver.get(base + "index.html");
    await driver.findElement(By.id("inc")).click();
    await driver.findElement(By.id("to-page2")).click(); // anchor → full navigation
    await driver.wait(until.urlContains("page2.html"), 5000);
    assert.equal(await driver.findElement(By.id("page2-heading")).getText(), "Page 2");
  });

  // Problem 3 — goBack destination capture (navigate().back is wrapped).
  it("goBack keeps destination", async function () {
    await driver.get(base + "index.html");
    await driver.findElement(By.id("inc")).click();
    await driver.get(base + "page2.html");
    await driver.navigate().back();
    await driver.wait(until.urlContains("index.html"), 5000);
    // Back on the home page (count may be 0 on reload or restored via bfcache).
    assert.ok(await driver.findElement(By.id("inc")), "should be back on index");
  });

  // Problem 1c — goto-only test: no DOM interactions -> no tested elements.
  it("goto only no interactions", async function () {
    await driver.get(base + "index.html");
    assert.ok(await driver.findElement(By.id("inc")));
  });
});
