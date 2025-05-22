import {
  type ApiSettings,
  type ExtensionSettings,
  type OtherSettings,
  type RecordSettings,
} from '~/types';


export const defaultRecordSettings: RecordSettings = {
  checkoutType: { type: 'checkoutEveryNvm', value: 50 },
  excludeAttribute: 'rr-ignore',
  maskInputOptions: {
    password: true,
  },
  slimDOMOptions: 'all',
  inlineStylesheet: true,
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
    scroll: 1000,
    media: 1000,
    input: 'last',
    canvas: 'all'
  },
  recordDOM: true,
  recordCanvas: true,
  collectFonts: true,
  inlineImages: true
};

export const defaultApiSettings: ApiSettings = {
  baseUrl: 'https://api.testmap.appsurify.com',
  authType: {
    type: 'jwt',
  },
  connectionTimeout: 60000,
};

export const defaultOtherSettings: OtherSettings = {
  enableDebugMode: false,
};

export const defaultExtensionSettings: ExtensionSettings = {
  recordSettings: defaultRecordSettings,
  apiSettings: defaultApiSettings,
  otherSettings: defaultOtherSettings,
};
