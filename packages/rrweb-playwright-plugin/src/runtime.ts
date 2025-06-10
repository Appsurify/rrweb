import type { TestRunContext } from './types';

export const testContexts = new Map<string, TestRunContext>();

export function setCurrentTestContext(key: string, ctx: TestRunContext): void {
  testContexts.set(key, ctx);
}

export function getCurrentTestContext(key: string): TestRunContext | undefined {
  return testContexts.get(key);
}

export function clearTestContext(key: string): void {
  testContexts.delete(key);
}
