// Shared Selenium helpers for the e2e suites — these translate the Playwright
// query idioms (getByRole / getByText / toHaveURL / goBack) used by the mirrored
// specs under tests/playwright/e2e into WebDriver equivalents.
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { Builder, By, until, Key } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");

// The only Appsurify TestMap import a consumer needs.
const { attach } = require("@appsurify-testmap/rrweb-selenium-plugin");

// --- Deterministic ChromeDriver resolution -------------------------------
// A stale `chromedriver` on PATH (e.g. an older Homebrew build) is picked up by
// Selenium Manager and causes intermittent SessionNotCreatedError when its major
// version lags the installed Chrome. Detect the Chrome major version and ask
// Selenium Manager for the matching driver, then bind it explicitly.
let _cachedDriverPath;

function chromeMajorVersion() {
  const candidates =
    process.platform === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
      : process.platform === "win32"
        ? ["chrome"]
        : ["google-chrome", "chromium", "chromium-browser", "chrome"];
  for (const bin of candidates) {
    try {
      const out = execFileSync(bin, ["--version"], { encoding: "utf8" });
      const m = out.match(/(\d+)\.\d+/);
      if (m) return m[1];
    } catch {
      /* try next */
    }
  }
  return null;
}

function resolveChromeDriverPath() {
  if (_cachedDriverPath !== undefined) return _cachedDriverPath;
  _cachedDriverPath = null;
  try {
    const dir = path.dirname(require.resolve("selenium-webdriver/package.json"));
    const plat =
      process.platform === "darwin"
        ? "macos"
        : process.platform === "win32"
          ? "windows"
          : "linux";
    const bin = path.join(
      dir,
      "bin",
      plat,
      plat === "windows" ? "selenium-manager.exe" : "selenium-manager",
    );
    const args = ["--browser", "chrome", "--output", "json"];
    const major = chromeMajorVersion();
    if (major) args.push("--browser-version", major);
    const out = execFileSync(bin, args, { encoding: "utf8" });
    _cachedDriverPath = JSON.parse(out)?.result?.driver_path || null;
  } catch {
    _cachedDriverPath = null;
  }
  return _cachedDriverPath;
}

async function makeDriver() {
  const options = new chrome.Options().addArguments(
    "--headless=new",
    "--window-size=1280,900",
    "--no-sandbox",
    "--disable-dev-shm-usage",
  );
  const builder = new Builder().forBrowser("chrome").setChromeOptions(options);
  const driverPath = resolveChromeDriverPath();
  if (driverPath) {
    builder.setChromeService(new chrome.ServiceBuilder(driverPath));
  }
  return attach(await builder.build());
}

// Safe XPath string literal (handles embedded quotes).
function xpathLit(s) {
  if (!s.includes("'")) return `'${s}'`;
  if (!s.includes('"')) return `"${s}"`;
  return "concat('" + s.split("'").join("',\"'\",'") + "')";
}

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ci = (node) => `translate(normalize-space(${node}),'${UPPER}','${LOWER}')`;

// ~ getByRole('link', { name, exact }) — exact or case-insensitive contains.
function linkByName(name, { exact = true } = {}) {
  return exact
    ? By.xpath(`//a[normalize-space(.)=${xpathLit(name)}]`)
    : By.xpath(`//a[contains(${ci(".")}, ${xpathLit(name.toLowerCase())})]`);
}

// ~ getByRole('button', { name }) — case-insensitive contains over button text.
function buttonByName(name) {
  return By.xpath(
    `//button[contains(${ci(".")}, ${xpathLit(name.toLowerCase())})]` +
      ` | //*[@role='button'][contains(${ci(".")}, ${xpathLit(name.toLowerCase())})]`,
  );
}

// ~ page.locator('nav').getByRole('link', { name }) — nav/header-scoped link.
function navLinkByName(name) {
  const lit = xpathLit(name.toLowerCase());
  return By.xpath(
    `//nav//a[contains(${ci(".")}, ${lit})] | //header//a[contains(${ci(".")}, ${lit})]`,
  );
}

// ~ getByText(/.../i) on any element.
function textByName(text) {
  return By.xpath(`//*[contains(${ci(".")}, ${xpathLit(text.toLowerCase())})]`);
}

async function waitLocated(driver, locator, timeout = 20000) {
  return driver.wait(until.elementLocated(locator), timeout);
}

async function waitVisible(driver, locator, timeout = 20000) {
  const el = await waitLocated(driver, locator, timeout);
  await driver.wait(until.elementIsVisible(el), timeout);
  return el;
}

async function waitUrl(driver, re, timeout = 20000) {
  await driver.wait(async () => re.test(await driver.getCurrentUrl()), timeout);
}

// Fill the first matching input among several CSS selectors (Playwright's
// `input[name=x], input[placeholder*=y]` comma-union, best-effort).
async function fillFirst(driver, selectors, value) {
  for (const sel of selectors) {
    const els = await driver.findElements(By.css(sel));
    if (els.length) {
      await els[0].clear();
      await els[0].sendKeys(value);
      return true;
    }
  }
  return false;
}

module.exports = {
  attach,
  makeDriver,
  By,
  until,
  Key,
  linkByName,
  navLinkByName,
  buttonByName,
  textByName,
  waitLocated,
  waitVisible,
  waitUrl,
  fillFirst,
};
