import { type ExtensionSettings, type RecordSettings } from "~/types";
import type { recordOptions } from "@appsurify-testmap/rrweb"
import type { eventWithTime } from "@appsurify-testmap/rrweb-types";


export const defaultRecordSettings: RecordSettings = {
  checkoutSetting: { type: "checkoutEveryEvc", value: true},
  sampling: {
    mousemove: false,
    mouseInteraction: {
      MouseUp: false,
      MouseDown: false,
      Click: false,
      ContextMenu: false,
      DblClick: false,
      Focus: false,
      Blur: false,
      TouchStart: false,
      TouchEnd: false,
    },
    scroll: 500,
    media: 1000,
    input: 'last',
    visibility: false,
  },
  maskInputOptions: {
    password: false,
    email: false,
    number: false,
    tel: false,
    text: false,
    textarea: false,
    select: false,
  },
};

export const defaultExtensionSettings: ExtensionSettings = {
  recordSettings: defaultRecordSettings,
  apiSettings: {
    authMethod: 'jwt'
  },
  otherSettings: {
    enableDebugMode: false
  }
}

export function settingsToRecordOptions(settings: RecordSettings): recordOptions<eventWithTime> {
  return {
    sampling: {
      ...settings.sampling,
      scroll: settings.sampling.scroll ?? undefined,
      media: settings.sampling.media ?? undefined,
      input: settings.sampling.input ?? undefined,
      visibility: settings.sampling.visibility ?? false,
      mouseInteraction:
        typeof settings.sampling.mouseInteraction === 'object'
          ? settings.sampling.mouseInteraction
          : defaultRecordSettings.sampling.mouseInteraction,
    },
    maskInputOptions: { ...settings.maskInputOptions },
    checkoutEveryNth: settings.checkoutSetting.type === 'checkoutEveryNth' ? settings.checkoutSetting.value : undefined,
    checkoutEveryNms: settings.checkoutSetting.type === 'checkoutEveryNms' ? settings.checkoutSetting.value : undefined,
    checkoutEveryEvc: settings.checkoutSetting.type === 'checkoutEveryEvc' ? settings.checkoutSetting.value : undefined,
  };
}

