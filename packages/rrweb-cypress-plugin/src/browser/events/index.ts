import { registerCypressEventListeners } from "./cypress";
import { registerMochaEventListeners, injectMochaHookFunctions } from "./mocha";

export const enableTestmap = () => {
  registerCypressEventListeners();
  registerMochaEventListeners();
  injectMochaHookFunctions();
};
