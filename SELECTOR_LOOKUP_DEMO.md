# SEQL Selector-Based Lookup in Mirror

This document demonstrates the new selector-based lookup functionality added to the Mirror class during replay.

## Overview

The Mirror class now maintains a selector index that allows you to find replayed DOM elements by their SEQL selectors, in addition to the existing ID-based lookup.

## New API Methods

### `getNodeBySelector(selector: string): Node | null`

Returns the first node matching the given SEQL selector, or `null` if not found.

```typescript
const mirror = replayer.getMirror();
const submitButton = mirror.getNodeBySelector('button[role="submit"]');
```

### `getNodesBySelector(selector: string): Node[]`

Returns all nodes matching the given SEQL selector. Returns an empty array if none found.

```typescript
const mirror = replayer.getMirror();
const allButtons = mirror.getNodesBySelector('button');
// Returns array of all button elements
```

### `hasSelector(selector: string): boolean`

Checks if any node with the given SEQL selector exists in the mirror.

```typescript
const mirror = replayer.getMirror();
if (mirror.hasSelector('input[type="email"]')) {
  const emailInput = mirror.getNodeBySelector('input[type="email"]');
  // Work with the element
}
```

## Usage Example

```typescript
import * as rrweb from '@appsurify-testmap/rrweb';

// 1. Record with selectors enabled
const events: eventWithTime[] = [];
const stopRecord = rrweb.record({
  emit: (event) => events.push(event),
  selector: {
    maxPathDepth: 10,
    enableSvgFingerprint: true,
    fallbackToBody: true,
  },
});

// User interactions happen here...
// (DOM elements are created, modified, etc.)

stopRecord();

// 2. Replay the events
const replayer = new rrweb.Replayer(events);
replayer.play();

// 3. Access replayed elements by selector
const mirror = replayer.getMirror();

// Find specific element
const loginButton = mirror.getNodeBySelector('button#login-btn');

// Find all matching elements
const allInputs = mirror.getNodesBySelector('input[type="text"]');

// Check existence before accessing
if (mirror.hasSelector('form.checkout')) {
  const checkoutForm = mirror.getNodeBySelector('form.checkout');
  // Process the form
}
```

## Implementation Details

### Architecture

The Mirror class maintains three internal indexes:

1. **idNodeMap**: `Map<number, Node>` - ID to Node mapping (existing)
2. **nodeMetaMap**: `WeakMap<Node, serializedNodeWithId>` - Node to metadata mapping (existing)
3. **selectorNodeMap**: `Map<string, Set<Node>>` - **NEW** Selector to Nodes mapping

### Performance

- **Lookup**: O(1) constant time complexity
- **Memory**: ~48 bytes per selector (string key + Set overhead)
- **Overhead**: For 10,000 elements ≈ 480 KB (negligible for modern browsers)

### Edge Cases Handled

1. **Duplicate Selectors**: Multiple elements can have the same selector
   - `getNodeBySelector()` returns the first match
   - `getNodesBySelector()` returns all matches

2. **Missing Selectors**: Elements without selectors (when `selector: false`)
   - Methods gracefully return `null` or `[]`
   - No errors thrown

3. **Index Synchronization**: Selector index automatically updates when:
   - Nodes are added via `add()`
   - Nodes are removed via `removeNodeFromMap()`
   - Nodes are replaced via `replace()`
   - Mirror is reset via `reset()`

## Backward Compatibility

✅ **100% Backward Compatible**

- All existing Mirror methods work unchanged
- New methods are pure additions to the interface
- If selectors aren't recorded (`selector: false`), lookups return `null`/`[]` without errors
- Existing code continues to work without modification

## Testing

### Unit Tests

Comprehensive unit tests in `packages/rrweb-snapshot/test/utils.test.ts`:

- ✅ Single selector lookup
- ✅ Multiple nodes with same selector
- ✅ Non-existent selectors
- ✅ Index cleanup on removal
- ✅ Index updates on replace
- ✅ Reset functionality
- ✅ Nodes without selectors
- ✅ Multiple different selectors

Run tests:
```bash
cd packages/rrweb-snapshot
yarn test utils.test.ts
```

### Type Safety

All implementations satisfy the `IMirror<TNode>` interface contract:

- `packages/types/src/index.ts` - Interface definition
- `packages/rrweb-snapshot/src/utils.ts` - Mirror for real DOM
- `packages/rrdom/src/index.ts` - Mirror for virtual RRDom

## Use Cases

### Test Automation

```typescript
// In Cypress plugin
const mirror = replayer.getMirror();
const submitBtn = mirror.getNodeBySelector('button[data-test="submit"]');
// Verify element properties during replay
```

### Debugging

```typescript
// Find elements that match specific patterns
const allForms = mirror.getNodesBySelector('form');
console.log(`Found ${allForms.length} forms in recording`);
```

### Analytics

```typescript
// Count interactive elements
const buttons = mirror.getNodesBySelector('button').length;
const links = mirror.getNodesBySelector('a[href]').length;
console.log(`Interactive elements: ${buttons + links}`);
```

## Future Enhancements

Potential additions (not implemented):

1. Query multiple selectors at once
2. CSS selector support (in addition to SEQL)
3. Selector pattern matching (regex/wildcards)
4. Performance monitoring/metrics

## References

- **SEQL Documentation**: `@whenessel/seql-js` package
- **Mirror Implementation**: `packages/rrweb-snapshot/src/utils.ts`
- **Type Definitions**: `packages/types/src/index.ts`
- **Tests**: `packages/rrweb-snapshot/test/utils.test.ts`
