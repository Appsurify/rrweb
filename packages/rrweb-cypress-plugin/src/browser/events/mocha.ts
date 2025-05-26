/// <reference types="cypress" />


export const registerMochaEventListeners = () => {
  // ⚠️ Плохой стиль, отключает всю типизацию
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((Cypress as any).mocha.getRunner() as Mocha.Runner)
      .on('hook', onHook);
};

const onHook = () => {
  // console.debug(`🟡 [${Date.now()}] [mocha] onHook:`);
};

export const injectMochaHookFunctions = () => {

  beforeEach('', ()=> {
    // console.debug(`🟡 [${Date.now()}] [mocha] beforeEach:`);
  });

  afterEach('', ()=> {
    // console.debug(`🟡 [${Date.now()}] [mocha] afterEach:`);
    // const currentTest = Cypress.currentTest;
    // const testKey = getTestKey({ titlePath: () => currentTest.titlePath });
    //
    // const ctx = getCurrentTestContext(testKey);
    // if (!ctx) return;
    // const serializedReport = serializeTestRunContextToJson(ctx);
    // console.log(`${Date.now()} [afterEach]`, currentTest, serializedReport);
    // cy.task('saveSnapshotReport', serializedReport)
  });

};
