import {
  type RecordSettings,
} from '~/types';

import type { recordOptions } from '@appsurify-testmap/rrweb';
import type { eventWithTime } from '@appsurify-testmap/rrweb-types';
import type { SlimDOMOptions } from '@appsurify-testmap/rrweb-snapshot';

export function RecordSettingsToRecordOptions(
  settings: RecordSettings,
): recordOptions<eventWithTime> {
  const {
    checkoutType,
    excludeAttribute,
    maskInputOptions,
    slimDOMOptions,
    inlineStylesheet,
    sampling,
    recordDOM,
    recordCanvas,
    collectFonts,
    inlineImages
  } = settings;
  let resolvedSlimDOM: SlimDOMOptions | 'all' | true | undefined;
  if (slimDOMOptions === true || slimDOMOptions === 'all') {
    resolvedSlimDOM = slimDOMOptions;
  } else {
    resolvedSlimDOM = undefined;
  }
  return {
    checkoutEveryNth:
      checkoutType.type === 'checkoutEveryNth'
        ? checkoutType.value
        : undefined,
    checkoutEveryNms:
      checkoutType.type === 'checkoutEveryNms'
        ? checkoutType.value
        : undefined,
    excludeAttribute: excludeAttribute,
    maskInputOptions: { ...maskInputOptions },
    slimDOMOptions: resolvedSlimDOM,
    inlineStylesheet: inlineStylesheet,
    sampling: { ...sampling },
    recordDOM: recordDOM,
    recordCanvas: recordCanvas,
    collectFonts: collectFonts,
    inlineImages: inlineImages
  };
}
