/// <reference types="cypress" />
import type { RecordingConfig, SamplingOptions } from './recorder/types';
import { defaultVisibilitySampling } from './recorder/types';


export type TestmapConfigSchema = {
  outputReportDirectory?: string;
  includeRawReport?: boolean;
  recording?: RecordingConfig;
}


export class TestmapConfig {
  private readonly config: TestmapConfigSchema;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const raw = Cypress.env('testmap');

    if (this.isValidObject(raw)) {
      this.config = raw as TestmapConfigSchema;
    } else {
      this.config = {};
    }
  }

  get outputReportDirectory(): string {
    return typeof this.config.outputReportDirectory === 'string'
      ? this.config.outputReportDirectory
      : 'test-results/cypress/ui';
  }

  get includeRawReport(): boolean {
    return typeof this.config.includeRawReport === 'boolean'
      ? this.config.includeRawReport
      : false;
  }

  get recording(): Required<RecordingConfig> {
    const rec = this.isValidObject(this.config.recording)
      ? this.config.recording
      : {};

    return {
      checkoutEveryNvm: typeof rec.checkoutEveryNvm === 'number'
        ? rec.checkoutEveryNvm
        : 10,

      excludeAttribute: this.parseRegExpOrDefault(
        rec.excludeAttribute,
        /data-(cy|test(id)?|cypress|highlight-el|cypress-el)/i
      ),

      maskInputOptions: this.isValidObject(rec.maskInputOptions)
        ? rec.maskInputOptions
        : { password: true },

      sampling: this.resolveSampling(rec.sampling),

      flushCustomEvent: rec.flushCustomEvent === 'before' || rec.flushCustomEvent === 'after'
        ? rec.flushCustomEvent
        : 'after',

      recordAfter:
        rec.recordAfter === 'DOMContentLoaded' ||
        rec.recordAfter === 'load' ||
        rec.recordAfter === 'DOMContentStabilized'
          ? rec.recordAfter
          : 'DOMContentLoaded',
    };
  }

  private isValidObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private parseRegExpOrDefault(value: unknown, fallback: RegExp): RegExp {
    if (value instanceof RegExp) return value;
    if (typeof value === 'string') {
      try {
        return new RegExp(value);
      } catch {
        return fallback;
      }
    }
    return fallback;
  }

  private resolveSampling(input?: unknown): SamplingOptions {
    if (!this.isValidObject(input)) return { visibility: defaultVisibilitySampling };

    const sampling = input as SamplingOptions;

    return {
      ...sampling,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      visibility: sampling.visibility === true
        ? defaultVisibilitySampling
        : sampling.visibility === false
          ? false
          : this.isValidObject(sampling.visibility)
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            ? { ...defaultVisibilitySampling, ...sampling.visibility }
            : defaultVisibilitySampling,
    };
  }
}
