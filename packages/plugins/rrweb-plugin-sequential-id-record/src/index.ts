import type { RecordPlugin } from '@appsurify-testmap/rrweb-types';

export type SequentialIdOptions = {
  key: string;
  getId?: () => number;  // ❗️необязательный колбэк для получения ID
};

const defaultOptions: SequentialIdOptions = {
  key: 'id',
};

export let globalSequentialId = 0;

export const PLUGIN_NAME = 'rrweb/sequential-id@1';

export const getRecordSequentialIdPlugin: (
  options?: Partial<SequentialIdOptions>,
) => RecordPlugin = (options) => {
  const _options = Object.assign({}, defaultOptions, options);
  let localId = 0;

  return {
    name: PLUGIN_NAME,
    eventProcessor(event) {
      const id = _options.getId ? _options.getId() : ++localId;
      Object.assign(event, {
        [_options.key]: id,
      });
      return event;
    },
    options: _options,
  };
};
