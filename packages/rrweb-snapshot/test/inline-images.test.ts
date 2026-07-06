/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_INLINE_IMAGES_OPTIONS,
  resolveInlineImagesOptions,
  scaledImageSize,
} from '../src/snapshot';

describe('resolveInlineImagesOptions', () => {
  it('returns false when inlining is disabled', () => {
    expect(resolveInlineImagesOptions(false)).toBe(false);
    expect(resolveInlineImagesOptions(undefined)).toBe(false);
  });

  it('resolves `true` to the defaults', () => {
    expect(resolveInlineImagesOptions(true)).toEqual(
      DEFAULT_INLINE_IMAGES_OPTIONS,
    );
  });

  it('keeps honoring dataURLOptions for `inlineImages: true` (legacy channel)', () => {
    expect(
      resolveInlineImagesOptions(true, { type: 'image/jpeg', quality: 0.9 }),
    ).toEqual({
      type: 'image/jpeg',
      quality: 0.9,
      maxDimension: DEFAULT_INLINE_IMAGES_OPTIONS.maxDimension,
    });
  });

  it('merges a partial options object over the defaults', () => {
    expect(resolveInlineImagesOptions({ quality: 0.5 })).toEqual({
      ...DEFAULT_INLINE_IMAGES_OPTIONS,
      quality: 0.5,
    });
  });

  it('ignores dataURLOptions when an options object is given', () => {
    expect(
      resolveInlineImagesOptions(
        { type: 'image/png' },
        { type: 'image/jpeg', quality: 0.2 },
      ),
    ).toEqual({
      ...DEFAULT_INLINE_IMAGES_OPTIONS,
      type: 'image/png',
    });
  });

  it('does not let explicit undefined fields override the defaults', () => {
    expect(
      resolveInlineImagesOptions({ type: undefined, quality: undefined }),
    ).toEqual(DEFAULT_INLINE_IMAGES_OPTIONS);
  });
});

describe('scaledImageSize', () => {
  it('caps the longest side and preserves aspect ratio', () => {
    expect(scaledImageSize(8000, 6000, 1920)).toEqual({
      width: 1920,
      height: 1440,
    });
    expect(scaledImageSize(6000, 8000, 1920)).toEqual({
      width: 1440,
      height: 1920,
    });
  });

  it('never upscales images below the cap', () => {
    expect(scaledImageSize(640, 480, 1920)).toEqual({
      width: 640,
      height: 480,
    });
    expect(scaledImageSize(1920, 1080, 1920)).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it('disables the cap for maxDimension <= 0', () => {
    expect(scaledImageSize(8000, 6000, 0)).toEqual({
      width: 8000,
      height: 6000,
    });
  });

  it('never collapses a side below 1px', () => {
    expect(scaledImageSize(10000, 1, 100)).toEqual({ width: 100, height: 1 });
  });
});
