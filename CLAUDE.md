# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

rrweb (record and replay the web) is a TypeScript monorepo for recording and replaying user interactions on the web. This is a fork customized for Appsurify TestMap with enhanced selector generation using SEQL.

## Working with Claude Code

### Context Files (`.claude/context/`)

This repository includes pre-built architectural context documents that provide deep insights into the codebase structure:

- **`packages.md`**: Comprehensive analysis of all 20 packages in the monorepo
  - 7 architectural layers with strict dependency hierarchy
  - Full public API surfaces with signatures and line numbers
  - Dependency maps and data flow diagrams
  - SEQL integration details
  - Manager pattern usage across packages

**When to use context files:**
- Before making changes that affect multiple packages
- When understanding cross-package dependencies
- For architectural decisions that span layers
- When planning refactorings or new features

**Priority:** Always consult relevant context files BEFORE making significant changes. They provide the "big picture" that's hard to reconstruct from individual files.

### Knowledge Base (`.kb/`)

The `.kb/` directory contains 117 standardized coding conventions and guidelines organized by scope:

- **`typescript/`** (17 entries): Naming conventions, type patterns, code organization
- **`claude-code/`** (18 entries): Agent teams, hooks, plugins, skills, subagents patterns
- **`chakra-ui/`** (12 entries): Component usage, styling, theming guidelines
- **`radix-ui/`** (70 entries): Component patterns, accessibility, design principles

**When to use the knowledge base:**
- Before writing new TypeScript code (check naming conventions)
- When implementing UI components (check component guidelines)
- When creating Claude Code plugins or agents (check claude-code patterns)
- For consistent code style across the project

**Priority:** Consult the knowledge base FIRST when:
1. Creating new files or components
2. Unsure about naming conventions
3. Implementing patterns that should follow project standards

**Exploring the knowledge base:**
```bash
# View the catalog
cat .kb/README.md

# Browse specific scope
ls .kb/typescript/naming/

# Read a specific convention
cat .kb/typescript/naming/classes.md
```

### Resource Priority Order

When working on tasks, consult resources in this order:

1. **Knowledge Base** (`.kb/`) - For conventions, patterns, and naming
2. **Context Files** (`.claude/context/`) - For architectural understanding
3. **This CLAUDE.md** - For build commands and workflow
4. **Source Code** - For implementation details

This approach ensures consistency with project standards while maintaining architectural awareness.

## Build System

### Package Manager
- Uses Yarn 1.22.19 (do not use npm)
- Yarn workspaces manage the monorepo
- Turbo for build orchestration

### Common Commands

```bash
# Install dependencies (first time setup)
yarn install

# Build all packages from scratch
yarn build:all

# Development mode (watch mode for all packages)
yarn dev

# Run all tests
yarn test

# Run tests in watch mode
yarn test:watch

# Update test snapshots
yarn test:update

# Type checking
yarn check-types

# Linting
yarn lint

# Format code
yarn format
```

### Package-Specific Commands

```bash
# Run tests for a specific package (from root)
cd packages/rrweb && yarn test

# Run tests without rebuilding (retest)
cd packages/rrweb && yarn retest

# Build a specific package
cd packages/rrweb && yarn build

# REPL testing tool
yarn repl
```

## Architecture

### Core Packages

The monorepo follows a layered architecture:

1. **@appsurify-testmap/rrweb-types** (`packages/types/`)
   - Shared TypeScript types and enums
   - Event types: `EventType`, `IncrementalSource`
   - Defines the structure of recorded events

2. **@appsurify-testmap/rrweb-snapshot** (`packages/rrweb-snapshot/`)
   - DOM serialization and rebuilding
   - Converts DOM trees to serializable data structures with unique IDs
   - Handles special cases: script sanitization, relative→absolute URL conversion, CSS inlining
   - **SEQL Integration**: Uses `@whenessel/seql-js` to generate SEQL selectors during serialization
   - Key file: `src/snapshot.ts`

3. **@appsurify-testmap/rrweb-utils** (`packages/utils/`)
   - Shared utilities across packages
   - DOM manipulation helpers
   - Browser compatibility polyfills

4. **@appsurify-testmap/rrdom** (`packages/rrdom/`)
   - Virtual DOM implementation for replay
   - Isolates replayed content from the replay environment

5. **@appsurify-testmap/rrweb** (`packages/rrweb/`)
   - Main package containing record and replay functionality
   - **Record side** (`src/record/`):
     - `index.ts`: Entry point, orchestrates recording
     - `observer.ts`: Initializes observers for DOM mutations, user interactions
     - `mutation.ts`: `MutationBuffer` class for batching DOM mutations
     - `observers/`: Specialized observers (canvas, visibility, etc.)
     - `iframe-manager.ts`: Handles cross-origin and same-origin iframes
     - `shadow-dom-manager.ts`: Shadow DOM support
     - `selector.ts`: SEQL selector generation and normalization
   - **Replay side** (`src/replay/`):
     - `index.ts`: Entry point for replaying events
     - `machine.ts`: State machine for managing replay lifecycle
     - `timer.ts`: Timestamp synchronization
     - Canvas, dialog, media subdirectories for specialized replay

6. **@appsurify-testmap/rrweb-player** (`packages/rrweb-player/`)
   - Svelte-based GUI player with timeline, controls
   - Built with SvelteKit

### Recording Flow

1. **Full Snapshot**: On initialization, `rrweb.record()` calls `snapshot()` to serialize the entire DOM tree into a tree structure with unique IDs (stored in a `Mirror`)
2. **Incremental Snapshots**: Observers track DOM mutations, user interactions (clicks, scrolls, input), canvas changes, stylesheet modifications, etc.
3. **MutationBuffer**: Batches DOM mutations before emitting to reduce event volume and handle complex mutation sequences
4. **Event Emission**: All events are timestamped and emitted via the `emit` callback provided to `record()`

### Key Architectural Patterns

- **Mirror**: Bidirectional map between DOM nodes and unique IDs for serialization
- **Observer Pattern**: Modular observers for different event types (mutation, input, canvas, media, etc.)
- **Manager Classes**: Encapsulate complex subsystems (IframeManager, ShadowDomManager, CanvasManager, StylesheetManager)
- **Error Handling**: `error-handler.ts` wraps callbacks to prevent recording crashes

### SEQL Integration

This fork includes SEQL (Semantic Element Query Language) selector generation:
- Integrated in `packages/rrweb-snapshot/src/snapshot.ts`
- SEQL selectors are generated during serialization for better element identification
- Used in `packages/rrweb/src/record/selector.ts` for normalization
- Dependency: `@whenessel/seql-js` package

## Testing

### Test Framework
- Uses Vitest (migrated from Jest)
- Puppeteer for browser automation in tests
- Jest-image-snapshot for visual regression testing

### Test Organization
- Integration tests: `packages/rrweb/test/integration.test.ts`
- Unit tests: `packages/rrweb/test/record/*.test.ts`, `packages/rrweb/test/replay/*.test.ts`
- Snapshot tests: Many tests use `.snap` files for output validation

### Running Tests
```bash
# Run all tests (rebuilds first)
yarn test

# Run without rebuild (faster iteration)
cd packages/rrweb && yarn retest

# Run specific test file
cd packages/rrweb && yarn vitest run test/record/webgl.test.ts

# Update snapshots when output changes are expected
yarn test:update
```

### Test Configuration
- Tests run with `maxConcurrency: 1` and `fileParallelism: false` to prevent race conditions
- Puppeteer can run headless (`PUPPETEER_HEADLESS=true`) or headful for debugging
- Old snapshot format is preserved (pre-Jest 29 style)

## Code Style

### ESLint Rules
- TypeScript strict mode enabled
- `camelcase` rule allows prefixes: `rr_.*`, `legacy_.*`, `UNSAFE_.*`, `__rrweb_.*`
- TSDoc syntax warnings enabled

### Formatting
- Prettier for code formatting
- Run `yarn format` before committing
- Format only changed files: `yarn format:head`

### Browser Compatibility
- Target: Modern browsers supporting `MutationObserver`
- No IE11 support
- Browserslist config: `defaults`, `not op_mini all`

## Development Workflow

### Initial Setup
```bash
yarn install
yarn build:all  # Required before first dev/test run
```

### Iterative Development
```bash
# Terminal 1: Watch mode for builds
yarn dev

# Terminal 2: Watch mode for tests (in package directory)
cd packages/rrweb
yarn test:watch
```

### Before Committing
```bash
yarn check-types  # TypeScript validation
yarn lint         # ESLint
yarn format       # Prettier
yarn test         # Full test suite
```

## Important Conventions

### Serialization Non-Standard Handling
1. Scripts are replaced with `noscript` tags (content not executed on replay)
2. Form values are captured as attributes (e.g., `<input value="...">`)
3. Relative URLs converted to absolute (including CSS)
4. External stylesheets are inlined when possible

### Naming Conventions
- Observer callbacks end with `Callback` (e.g., `mutationCallback`)
- Manager classes end with `Manager` (e.g., `IframeManager`)
- Event types use `EventType` enum, incremental sources use `IncrementalSource` enum

### Cross-Package Dependencies
- Build order matters: `types` → `utils` → `rrweb-snapshot` → `rrdom` → `rrweb`
- Turbo handles dependency graph via `^prepublish` in turbo.json
- Update TypeScript project references: `yarn references:update`

## Debugging

### REPL Tool
Interactive testing tool for record/replay:
```bash
yarn repl
```

### Headful Browser Testing
```bash
cd packages/rrweb
PUPPETEER_HEADLESS=false yarn test:headful
```

### Common Issues
- **Build errors**: Run `yarn build:all` from root to rebuild all packages in order
- **Test failures after code changes**: Check if snapshots need updating with `yarn test:update`
- **Type errors**: Ensure TypeScript project references are up to date with `yarn references:update`
- **Memory issues**: Build uses `NODE_OPTIONS='--max-old-space-size=4096'` for large builds