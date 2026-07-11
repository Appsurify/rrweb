// The site's WAF answers 403 to Cypress's default request signature (curl gets
// 200 with any UA, so it is not an IP block). Sending a normal browser
// User-Agent on the initial visit is enough to get through.
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

describe('Dublin Cyclery navigation', () => {
  it('goes to Repairs, then returns home', () => {
    cy.visit('https://www.dublincyclery.com/', {
      headers: { 'User-Agent': BROWSER_UA },
    });

    cy.contains('a', /repairs/i)
      .should('be.visible')
      .click();

    cy.url().should('include', '/repair-services/');

    cy.go('back');

    cy.url().should('eq', 'https://www.dublincyclery.com/');
  });
});