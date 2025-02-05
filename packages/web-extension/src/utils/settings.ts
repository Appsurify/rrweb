import { defaultSettings, type Settings } from "~/types";
import type { recordOptions } from "@appsurify-testmap/rrweb"
import type { eventWithTime } from "@appsurify-testmap/rrweb-types";


export function settingsToRecordOptions(settings: Settings): recordOptions<eventWithTime> {
  const recordOptions: recordOptions<eventWithTime> = {
    sampling: {
      ...settings.sampling,
      scroll: typeof settings.sampling.scroll === 'boolean'
        ? undefined
        : settings.sampling.scroll,
      media: typeof settings.sampling.media === 'boolean'
        ? undefined
        : settings.sampling.media,
      input: typeof settings.sampling.input === 'boolean'
        ? undefined
        : settings.sampling.input,
      visibility: typeof settings.sampling.visibility === 'boolean'
        ? settings.sampling.visibility
        : settings.sampling.visibility === 1,
      mouseInteraction:
        typeof settings.sampling.mouseInteraction === 'object'
          ? settings.sampling.mouseInteraction
          : defaultSettings.sampling.mouseInteraction ,
    },
    maskInputOptions: { ...settings.maskInputOptions },
  };

  switch (settings.checkoutSetting.type) {
    case 'checkoutEveryNth':
      recordOptions.checkoutEveryNth = settings.checkoutSetting.value;
      break;
    case 'checkoutEveryNms':
      recordOptions.checkoutEveryNms = settings.checkoutSetting.value;
      break;
    case 'checkoutEveryEvc':
      recordOptions.checkoutEveryEvc = settings.checkoutSetting.value;
      break;
  }

  return recordOptions;
}

