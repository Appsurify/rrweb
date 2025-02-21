import {
  type RecordSettings,
} from '~/types';

import type { recordOptions } from '@appsurify-testmap/rrweb';
import type { eventWithTime } from '@appsurify-testmap/rrweb-types';

export function RecordSettingsToRecordOptions(
  settings: RecordSettings,
): recordOptions<eventWithTime> {
  return {
    sampling: { ...settings.sampling },
    maskInputOptions: { ...settings.maskInputOptions },
    checkoutEveryNth:
      settings.checkoutType.type === 'checkoutEveryNth'
        ? settings.checkoutType.value
        : undefined,
    checkoutEveryNms:
      settings.checkoutType.type === 'checkoutEveryNms'
        ? settings.checkoutType.value
        : undefined,
    checkoutEveryEvc:
      settings.checkoutType.type === 'checkoutEveryEvc'
        ? settings.checkoutType.value
        : undefined,
  };
}
