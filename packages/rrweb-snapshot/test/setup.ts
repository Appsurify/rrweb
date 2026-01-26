import { JSDOM } from 'jsdom';
import { applyJsdomExtended } from '@whenessel/jsdom-extended';

// Apply jsdom-extended to the global window object
if (typeof window !== 'undefined') {
  applyJsdomExtended(window as any);
}
