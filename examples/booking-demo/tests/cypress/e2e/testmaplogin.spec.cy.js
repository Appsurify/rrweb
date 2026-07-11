describe('Login test', () => {
  it('logs in with email and password', () => {
    cy.visit('https://derek.dev.testmap.cloud/auth');

    cy.get('input[type="email"], input[name="email"]')
      .first()
      .type('derek@appsurify.com');

    cy.get('input[type="password"], input[name="password"]')
      .first()
      .type('test1234');

    cy.contains('button, [type="submit"]', 'Log In').click();

    // The login itself works — it was the next step that failed. The old
    // assertion clicked a project named 'Test 32', but the projects on this dev
    // environment are live data and that one is gone (the list now holds Derek
    // 2nd Project, Steinway, Pinarello, Dublin, TestMap, Pleasanton, …). Pinning
    // a project name makes the test fail whenever someone edits the environment.
    // Assert the post-login state, which is what this test is actually about.
    cy.url({ timeout: 20000 }).should('not.include', '/auth');
    cy.contains(/All Projects/i, { timeout: 20000 }).should('be.visible');
  });
});