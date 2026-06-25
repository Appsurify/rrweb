# Selenium e2e suites — symmetry with `tests/playwright/e2e`

Selenium ports of the Playwright e2e specs, recording the **same real apps at the
same addresses** so the two recorders can be compared on identical flows.

| Selenium spec | Mirrors (Playwright) | App | Exercises |
| --- | --- | --- | --- |
| `test/full-booking-flow.test.cjs` | `full-booking-flow.spec.ts` | modern-seaside-stay (SPA) | multi-step booking form |
| `test/navigation-snapshots.test.cjs` | `navigation-snapshots.spec.ts` | modern-seaside-stay (SPA) | many SPA route changes |
| `test/goback-snapshot.test.cjs` | `goback-snapshot.spec.ts` | modern-seaside-stay (SPA) | `navigate().back()` capture |
| `test/ffbc-primavera-goback.test.cjs` | `ffbc-primavera-goback.spec.ts` | ffbc.org (multi-page) | link-click full nav + goBack + hover |
| `test/trekbikes-highload.test.cjs` | `trekbikes-highload.spec.ts` | trekbikes.com | heavy page + cookie consent |

The Playwright `page.getByRole/getByText/toHaveURL/goBack` idioms are translated to
WebDriver in `lib/driver.cjs`. Each test still needs only the one recording line —
`attach(driver)` — wired once in `lib/driver.cjs`'s `makeDriver()`.

```bash
yarn install            # or npm install
yarn test               # all suites
yarn test:goback        # one suite (also :booking :navigation :ffbc :trekbikes)
```

Reports → `test-results/selenium/ui/` (per-test JSON + `ui-coverage-reports.zip`).
Validate them with `scripts/validate_selenium_report.py --dir <that dir>`.

> These hit **live third-party sites** (ffbc.org, trekbikes.com), so they are
> inherently network-dependent and slower than the local demos; `.mocharc.cjs`
> sets a 90s timeout and one retry. The modern-seaside-stay suites (an
> Appsurify-hosted demo) are the most reliable to run offline-of-CI.
