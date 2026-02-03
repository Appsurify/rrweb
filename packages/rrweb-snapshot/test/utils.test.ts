/**
 * @vitest-environment jsdom
 */
import { describe, it, test, expect } from 'vitest';
import {
  escapeImportStatement,
  extractFileExtension,
  fixSafariColons,
  isNodeMetaEqual,
  createMirror,
} from '../src/utils';
import { NodeType } from '@appsurify-testmap/rrweb-types';
import type { serializedNode, serializedNodeWithId } from '@appsurify-testmap/rrweb-types';

describe('utils', () => {
  describe('isNodeMetaEqual()', () => {
    const document1: serializedNode = {
      type: NodeType.Document,
      compatMode: 'CSS1Compat',
      childNodes: [],
    };
    const document2: serializedNode = {
      type: NodeType.Document,
      compatMode: 'BackCompat',
      childNodes: [],
    };
    const documentType1: serializedNode = {
      type: NodeType.DocumentType,
      name: 'html',
      publicId: '',
      systemId: '',
    };
    const documentType2: serializedNode = {
      type: NodeType.DocumentType,
      name: 'html',
      publicId: '',
      systemId: 'http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd',
    };
    const text1: serializedNode = {
      type: NodeType.Text,
      textContent: 'Hello World',
    };
    const text2: serializedNode = {
      type: NodeType.Text,
      textContent: 'Hello world',
    };
    const comment1: serializedNode = {
      type: NodeType.Comment,
      textContent: 'Hello World',
    };
    const comment2: serializedNode = {
      type: NodeType.Comment,
      textContent: 'Hello world',
    };
    const element1: serializedNode = {
      type: NodeType.Element,
      tagName: 'div',
      attributes: {
        className: 'test',
      },
      childNodes: [],
    };
    const element2: serializedNode = {
      type: NodeType.Element,
      tagName: 'span',
      attributes: {
        'aria-label': 'Hello World',
      },
      childNodes: [],
    };
    const element3: serializedNode = {
      type: NodeType.Element,
      tagName: 'div',
      attributes: { id: 'test' },
      childNodes: [comment1 as serializedNodeWithId],
    };

    it('should return false if two nodes have different node types', () => {
      expect(
        isNodeMetaEqual(
          undefined as unknown as serializedNode,
          null as unknown as serializedNode,
        ),
      ).toBeFalsy();
      expect(isNodeMetaEqual(document1, element1)).toBeFalsy();
      expect(isNodeMetaEqual(document1, documentType1)).toBeFalsy();
      expect(isNodeMetaEqual(documentType1, element1)).toBeFalsy();
      expect(isNodeMetaEqual(text1, comment1)).toBeFalsy();
      expect(isNodeMetaEqual(text1, element1)).toBeFalsy();
      expect(isNodeMetaEqual(comment1, element1)).toBeFalsy();
    });

    it('should compare meta data of two document nodes', () => {
      expect(
        isNodeMetaEqual(document1, JSON.parse(JSON.stringify(document1))),
      ).toBeTruthy();
      expect(
        isNodeMetaEqual(JSON.parse(JSON.stringify(document2)), document2),
      ).toBeTruthy();
      expect(isNodeMetaEqual(document1, document2)).toBeFalsy();
    });

    it('should compare meta data of two documentType nodes', () => {
      expect(
        isNodeMetaEqual(
          documentType1,
          JSON.parse(JSON.stringify(documentType1)),
        ),
      ).toBeTruthy();
      expect(
        isNodeMetaEqual(
          JSON.parse(JSON.stringify(documentType2)),
          documentType2,
        ),
      ).toBeTruthy();
      expect(isNodeMetaEqual(documentType1, documentType2)).toBeFalsy();
    });

    it('should compare meta data of two text nodes', () => {
      expect(
        isNodeMetaEqual(text1, JSON.parse(JSON.stringify(text1))),
      ).toBeTruthy();
      expect(
        isNodeMetaEqual(JSON.parse(JSON.stringify(text2)), text2),
      ).toBeTruthy();
      expect(isNodeMetaEqual(text1, text2)).toBeFalsy();
    });

    it('should compare meta data of two comment nodes', () => {
      expect(
        isNodeMetaEqual(comment1, JSON.parse(JSON.stringify(comment1))),
      ).toBeTruthy();
      expect(
        isNodeMetaEqual(JSON.parse(JSON.stringify(comment2)), comment2),
      ).toBeTruthy();
      expect(isNodeMetaEqual(comment1, comment2)).toBeFalsy();
    });

    it('should compare meta data of two HTML elements', () => {
      expect(
        isNodeMetaEqual(element1, JSON.parse(JSON.stringify(element1))),
      ).toBeTruthy();
      expect(
        isNodeMetaEqual(JSON.parse(JSON.stringify(element2)), element2),
      ).toBeTruthy();
      expect(
        isNodeMetaEqual(element1, {
          ...element1,
          childNodes: [comment2 as serializedNodeWithId],
        }),
      ).toBeTruthy();
      expect(isNodeMetaEqual(element1, element2)).toBeFalsy();
      expect(isNodeMetaEqual(element1, element3)).toBeFalsy();
      expect(isNodeMetaEqual(element2, element3)).toBeFalsy();
    });
  });
  describe('extractFileExtension', () => {
    test('absolute path', () => {
      const path = 'https://example.com/styles/main.css';
      const extension = extractFileExtension(path);
      expect(extension).toBe('css');
    });

    test('relative path', () => {
      const path = 'styles/main.css';
      const baseURL = 'https://example.com/';
      const extension = extractFileExtension(path, baseURL);
      expect(extension).toBe('css');
    });

    test('path with search parameters', () => {
      const path = 'https://example.com/scripts/app.js?version=1.0';
      const extension = extractFileExtension(path);
      expect(extension).toBe('js');
    });

    test('path with fragment', () => {
      const path = 'https://example.com/styles/main.css#section1';
      const extension = extractFileExtension(path);
      expect(extension).toBe('css');
    });

    test('path with search parameters and fragment', () => {
      const path = 'https://example.com/scripts/app.js?version=1.0#section1';
      const extension = extractFileExtension(path);
      expect(extension).toBe('js');
    });

    test('path without extension', () => {
      const path = 'https://example.com/path/to/directory/';
      const extension = extractFileExtension(path);
      expect(extension).toBeNull();
    });

    test('invalid URL', () => {
      const path = '!@#$%^&*()';
      const baseURL = 'invalid';
      const extension = extractFileExtension(path, baseURL);
      expect(extension).toBeNull();
    });

    test('path with multiple dots', () => {
      const path = 'https://example.com/scripts/app.min.js?version=1.0';
      const extension = extractFileExtension(path);
      expect(extension).toBe('js');
    });
  });

  describe('escapeImportStatement', () => {
    it('parses imports with quotes correctly', () => {
      const out1 = escapeImportStatement({
        cssText: `@import url("/foo.css;900;800"");`,
        href: '/foo.css;900;800"',
        media: {
          length: 0,
        },
        layerName: null,
        supportsText: null,
      } as unknown as CSSImportRule);
      expect(out1).toEqual(`@import url("/foo.css;900;800\\"");`);

      const out2 = escapeImportStatement({
        cssText: `@import url("/foo.css;900;800"") supports(display: flex);`,
        href: '/foo.css;900;800"',
        media: {
          length: 0,
        },
        layerName: null,
        supportsText: 'display: flex',
      } as unknown as CSSImportRule);
      expect(out2).toEqual(
        `@import url("/foo.css;900;800\\"") supports(display: flex);`,
      );

      const out3 = escapeImportStatement({
        cssText: `@import url("/foo.css;900;800"");`,
        href: '/foo.css;900;800"',
        media: {
          length: 1,
          mediaText: 'print, screen',
        },
        layerName: null,
        supportsText: null,
      } as unknown as CSSImportRule);
      expect(out3).toEqual(`@import url("/foo.css;900;800\\"") print, screen;`);

      const out4 = escapeImportStatement({
        cssText: `@import url("/foo.css;900;800"") layer(layer-1);`,
        href: '/foo.css;900;800"',
        media: {
          length: 0,
        },
        layerName: 'layer-1',
        supportsText: null,
      } as unknown as CSSImportRule);
      expect(out4).toEqual(
        `@import url("/foo.css;900;800\\"") layer(layer-1);`,
      );

      const out5 = escapeImportStatement({
        cssText: `@import url("/foo.css;900;800"") layer;`,
        href: '/foo.css;900;800"',
        media: {
          length: 0,
        },
        layerName: '',
        supportsText: null,
      } as unknown as CSSImportRule);
      expect(out5).toEqual(`@import url("/foo.css;900;800\\"") layer;`);
    });
  });
  describe('fixSafariColons', () => {
    it('parses : in attribute selectors correctly', () => {
      const out1 = fixSafariColons('[data-foo] { color: red; }');
      expect(out1).toEqual('[data-foo] { color: red; }');

      const out2 = fixSafariColons('[data-foo:other] { color: red; }');
      expect(out2).toEqual('[data-foo\\:other] { color: red; }');

      const out3 = fixSafariColons('[data-aa\\:other] { color: red; }');
      expect(out3).toEqual('[data-aa\\:other] { color: red; }');
    });
  });

  describe('Mirror selector-based lookup', () => {
    it('should return node by unique selector', () => {
      const mirror = createMirror();
      const node = document.createElement('button');
      mirror.add(node, {
        id: 1,
        type: NodeType.Element,
        tagName: 'button',
        attributes: { role: 'submit' },
        childNodes: [],
        selector: 'button[role="submit"]'
      });

      expect(mirror.getNodeBySelector('button[role="submit"]')).toBe(node);
    });

    it('should return first node when multiple nodes have same selector', () => {
      const mirror = createMirror();
      const node1 = document.createElement('div');
      const node2 = document.createElement('div');

      mirror.add(node1, {
        id: 1,
        type: NodeType.Element,
        tagName: 'div',
        attributes: { class: 'card' },
        childNodes: [],
        selector: 'div.card'
      });
      mirror.add(node2, {
        id: 2,
        type: NodeType.Element,
        tagName: 'div',
        attributes: { class: 'card' },
        childNodes: [],
        selector: 'div.card'
      });

      const result = mirror.getNodeBySelector('div.card');
      expect([node1, node2]).toContain(result);
    });

    it('should return all nodes with same selector', () => {
      const mirror = createMirror();
      const node1 = document.createElement('button');
      const node2 = document.createElement('button');

      mirror.add(node1, {
        id: 1,
        type: NodeType.Element,
        tagName: 'button',
        attributes: {},
        childNodes: [],
        selector: 'button'
      });
      mirror.add(node2, {
        id: 2,
        type: NodeType.Element,
        tagName: 'button',
        attributes: {},
        childNodes: [],
        selector: 'button'
      });

      const results = mirror.getNodesBySelector('button');
      expect(results).toHaveLength(2);
      expect(results).toContain(node1);
      expect(results).toContain(node2);
    });

    it('should return null for non-existent selector', () => {
      const mirror = createMirror();
      expect(mirror.getNodeBySelector('non-existent')).toBeNull();
    });

    it('should return empty array for non-existent selector', () => {
      const mirror = createMirror();
      expect(mirror.getNodesBySelector('non-existent')).toEqual([]);
    });

    it('should handle removal from selector index', () => {
      const mirror = createMirror();
      const node = document.createElement('div');
      mirror.add(node, {
        id: 1,
        type: NodeType.Element,
        tagName: 'div',
        attributes: { class: 'test' },
        childNodes: [],
        selector: 'div.test'
      });

      expect(mirror.hasSelector('div.test')).toBe(true);

      mirror.removeNodeFromMap(node);
      expect(mirror.hasSelector('div.test')).toBe(false);
    });

    it('should clean up empty Sets after removal', () => {
      const mirror = createMirror();
      const node = document.createElement('div');
      mirror.add(node, {
        id: 1,
        type: NodeType.Element,
        tagName: 'div',
        attributes: { class: 'cleanup' },
        childNodes: [],
        selector: 'div.cleanup'
      });
      mirror.removeNodeFromMap(node);

      // After removal, selector should not exist
      expect(mirror.hasSelector('div.cleanup')).toBe(false);
      expect(mirror.getNodeBySelector('div.cleanup')).toBeNull();
    });

    it('should update selector index on replace', () => {
      const mirror = createMirror();
      const oldNode = document.createElement('div');
      const newNode = document.createElement('div');

      mirror.add(oldNode, {
        id: 1,
        type: NodeType.Element,
        tagName: 'div',
        attributes: { class: 'replace' },
        childNodes: [],
        selector: 'div.replace'
      });
      mirror.replace(1, newNode);

      expect(mirror.getNodeBySelector('div.replace')).toBe(newNode);
      expect(mirror.getNodeBySelector('div.replace')).not.toBe(oldNode);
    });

    it('should reset selector index', () => {
      const mirror = createMirror();
      const node = document.createElement('div');
      mirror.add(node, {
        id: 1,
        type: NodeType.Element,
        tagName: 'div',
        attributes: { class: 'reset' },
        childNodes: [],
        selector: 'div.reset'
      });

      mirror.reset();
      expect(mirror.getNodeBySelector('div.reset')).toBeNull();
      expect(mirror.hasSelector('div.reset')).toBe(false);
    });

    it('should handle nodes without selectors', () => {
      const mirror = createMirror();
      const node = document.createElement('div');
      mirror.add(node, {
        id: 1,
        type: NodeType.Element,
        tagName: 'div',
        attributes: {},
        childNodes: []
        // no selector field
      });

      expect(mirror.getId(node)).toBe(1);
      expect(mirror.getNodeBySelector('anything')).toBeNull();
    });

    it('should handle multiple nodes with different selectors', () => {
      const mirror = createMirror();
      const button = document.createElement('button');
      const input = document.createElement('input');
      const div = document.createElement('div');

      mirror.add(button, {
        id: 1,
        type: NodeType.Element,
        tagName: 'button',
        attributes: { id: 'submit-btn' },
        childNodes: [],
        selector: 'button#submit-btn'
      });
      mirror.add(input, {
        id: 2,
        type: NodeType.Element,
        tagName: 'input',
        attributes: { type: 'email' },
        childNodes: [],
        selector: 'input[type="email"]'
      });
      mirror.add(div, {
        id: 3,
        type: NodeType.Element,
        tagName: 'div',
        attributes: { class: 'container' },
        childNodes: [],
        selector: 'div.container'
      });

      expect(mirror.getNodeBySelector('button#submit-btn')).toBe(button);
      expect(mirror.getNodeBySelector('input[type="email"]')).toBe(input);
      expect(mirror.getNodeBySelector('div.container')).toBe(div);
      expect(mirror.hasSelector('button#submit-btn')).toBe(true);
      expect(mirror.hasSelector('input[type="email"]')).toBe(true);
      expect(mirror.hasSelector('div.container')).toBe(true);
    });
  });
});
