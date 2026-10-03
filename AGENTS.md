# Codex instructions — Appsurify rrweb fork

This Yarn 1 monorepo records/replays browser interactions and produces Testmap UI reports. Read package manifests, current source and tests before historical descriptions in `CLAUDE.md`; its `.kb/` and `.claude/context/` references may be unavailable. Do not treat historical `.claude/plans` as completed behavior. Claude configuration remains separate from Codex; its tool permissions do not authorize actions here.

## Ownership and contracts

- `packages/types`: event enums, event payloads and selector options.
- `packages/rrweb-snapshot`: DOM serialization/rebuild, Mirror IDs, `serializedNode.selector` generated through `@whenessel/seql-js`.
- `packages/utils`, `rrdom`, `rrdom-nodejs`: utilities, virtual DOM and Node DOM support.
- `packages/rrweb`: recorder observers/managers and replay. Navigation lives in `src/record/observers/navigation/`; visibility in `observers/visibility/`; selector normalization in `src/record/selector.ts`.
- `packages/record`, `replay`, `all`, `packer`, `rrweb-player`: public wrappers, encoding and Svelte player consumed by Testmap frontend.
- `packages/plugins/*`: console, canvas/WebRTC and sequential-ID plugins.
- `packages/rrweb-{playwright,cypress,selenium}-plugin`: automation capture and per-test report lifecycle. Selenium has adapters for mocha, Jest, Vitest and node:test; unit tests use fake WebDriver and fake UMD sources.
- `packages/web-extension` and `rrvideo`: extension and video export with separate environment requirements.
- `examples/booking-demo` is outside workspaces; its own file dependencies and copied dist may lag source. Its Selenium runner subprojects are separate packages.

Report writers emit `{events, metadata:{runner,spec,suite,test,browser}}` and `ui-coverage-reports.zip`. Preserve sequential event IDs, timestamps, node IDs, META→FullSnapshot pairing, selectors, custom-event payloads and metadata compatibility. Backend `testmap.infrastructure.ui_report` consumes these reports; Testmap frontend consumes replay/snapshot packages; google-custom-events shares SEQL identity. Changes to identity, event enum/payload, serialization or wrapper exports require consumer analysis, fixtures and compatibility evidence, including old reports/new replay when applicable. Do not assume upgrading a SEQL dependency alone changes all deployed consumers.

For cross-repository work explicitly read the backend's `.agents/skills/testmap-xrepo/SKILL.md` and `references/system-map.md` at `/Users/whenessel/Development/PycharmProjects/appsurify-testmap-backend` when accessible. This is a shared document, not an automatically loaded skill from another repository. HANDOFF includes BASE commit(s), changed files, contract/version impact, reproduction, executed checks and remaining blockers.

## Commands and environment

Use Yarn Classic; `packageManager` pins `yarn@1.22.19`. Existing local Yarn may differ; record versions. Root workspaces are `packages/*` and `packages/plugins/*`. Dependencies/browsers must already be available for offline checks; ask for help when they are missing rather than silently installing. `rrvideo` has an install hook that runs `playwright install`.

Commands below were verified statically from manifests, not promises of a green full suite:

| Scope | Command | Effect/prerequisite |
| --- | --- | --- |
| Selected package build | `yarn turbo run prepublish --filter=@appsurify-testmap/rrweb-snapshot` | Builds declared upstream graph; produces artifacts |
| Full build | `yarn build:all` | Runs prepublish and project-reference generation; writes tsconfig references/build outputs |
| Selected package check | `yarn workspace @appsurify-testmap/rrweb-snapshot check-types` | Requires upstream types/artifacts |
| All types/lint | `yarn check-types`; `yarn lint` | Types depend on upstream prepublish; lint uses legacy ESLint + docs markdownlint |
| rrweb iteration | `yarn workspace @appsurify-testmap/rrweb retest` | No rebuild; Puppeteer headless, benchmark excluded; built artifacts needed |
| Focused rrweb test | `cd packages/rrweb && PUPPETEER_HEADLESS=true yarn vitest run test/record/navigation.test.ts` | Existing browser and artifacts needed |
| Snapshot iteration | `yarn workspace @appsurify-testmap/rrweb-snapshot retest` | Existing build, jsdom setup and snapshots |
| Selenium unit | `yarn workspace @appsurify-testmap/rrweb-selenium-plugin test --maxWorkers=1 --no-file-parallelism` | Fake drivers; Vitest stubs `.umd.cjs.src`; no real browser |
| Whole test suite | `yarn test` | Turbo upstream builds, serial tasks; individual suites have differing browser requirements |
| Debug REPL | `yarn repl` | Builds first; local browser/tool server, inspect target before use |

`build` in many packages delegates to Turbo; prefer explicit root filters to avoid accidentally building the whole monorepo. Turbo test/check-types depend on upstream prepublish; do not call them read-only. `references:update`, `format`, `format:head`, `test:update` and `retest:update` mutate source/config/snapshots. Check-format selected files with `yarn prettier --check <files>`; format only task-owned files. No automatic release, pack/publish/version changes or upload scripts. No active GitHub CI jobs were present at inspection; `.github/workflows` contains only `.gitkeep`.

## Bug and regression work

Read `.agents/skills/rrweb-regression/SKILL.md` for capture/replay/selector or automation-report bugs. Reproduce with a minimal local fixture, trace the first divergent event/lifecycle, fix the owning layer, add a regression that fails before the fix, then run selected checks and broaden to impacted consumers. Preserve current snapshot formatting, single concurrency and stable event ordering. Never update goldens just to make failures disappear; explain each expected delta.

Important invariants:
- Script→noscript sanitization, URL absolutization, input masking/capture and iframe/shadow boundaries remain intact.
- Playwright lifecycle belongs to fixtures for every spec. Stop must call the browser stop function and flush pending navigation snapshot before save/context close. CLI `--reporter` replaces configured reporters and can disable run cleanup/ZIP creation.
- Cypress stop/flush belongs before `test:after:run`; save uses the Node task bridge. Reporter registration removes its configured output directory. Playwright reporter `onBegin` likewise owns run cleanup. Use dedicated temporary report directories for experiments.
- Plugins inline recorder and sequential-ID UMDs at build time. Playwright/Selenium `devBuild` skips upstream rebuilding; stale embedded UMDs can invalidate an apparent fix. Cypress has no declared `devBuild` script.
- Compact JSON avoids oversized string failures; preserve report envelope and investigate size regressions rather than restoring pretty-printing indiscriminately.

## Working-tree and access boundaries

Inspect Git status before edits and at handoff. Keep unrelated modifications/deletions; do not restore removed docs/specs or overwrite untracked scripts. In particular, existing deleted Cypress specs and untracked Selenium upload script are user work. Use isolated copies or temporary output for checks where possible and label isolation adjustments. Inspect demo configs/spec targets before any browser run: some target external applications. Run only an explicitly scoped local fixture; never run all booking-demo specs blindly. Report uploads, production actions, recursive cleanup of real output directories, credentials and browser downloads need separate authorization. Do not read `.env`/keys/tokens into outputs or log DOM/report data containing sensitive content. If local fixtures, backend imports, browsers or expected contract details are unavailable, report the concrete gap and request only what is needed.
