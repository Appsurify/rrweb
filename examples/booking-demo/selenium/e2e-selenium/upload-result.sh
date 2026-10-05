# Example 1
# Env variables
TESTMAP_URL=https://derek.dev.testmap.cloud/api/v1/reports/import
TESTMAP_TOKEN="${TESTMAP_TOKEN:?set TESTMAP_TOKEN (see .env)}"
PROJECT_NAME='Selenium (Optimization e2e)'
TESTRUN_NAME='DEMO RUN {SHA}'
# CMD
curl -X "POST" \
  "$TESTMAP_URL" \
  -H "Authorization: Bearer $TESTMAP_TOKEN" \
  -F "project_name=$PROJECT_NAME" \
  -F "testrun_name=$TESTRUN_NAME" \
  -F "files=@test-results/selenium/ui/ui-coverage-reports.zip"

# Example 2
# Env variables
TESTMAP_URL=https://derek.dev.testmap.cloud/api/v1/reports/import
TESTMAP_TOKEN="${TESTMAP_TOKEN:?set TESTMAP_TOKEN (see .env)}"
PROJECT_NAME='Selenium (Optimization e2e)'
# CMD
curl -X "POST" \
  "$TESTMAP_URL" \
  -H "Authorization: Bearer $TESTMAP_TOKEN" \
  -F "project_name=$PROJECT_NAME" \
  -F "files=@test-results/selenium/ui/ui-coverage-reports.zip"

# Example 3
# Env variables
TESTMAP_URL=https://derek.dev.testmap.cloud/api/v1/reports/import
TESTMAP_TOKEN="${TESTMAP_TOKEN:?set TESTMAP_TOKEN (see .env)}"
PROJECT_NAME='Selenium (Optimization e2e)'
# CMD
curl -X "POST" \
  "$TESTMAP_URL" \
  -H "Authorization: Bearer $TESTMAP_TOKEN" \
  -F "project_name=$PROJECT_NAME" \
  -F "files=@test-results/selenium/ui/ffbc-primavera-goback.test.cjs/chrome/ffbc.org-navigation-+-goBack-Primavera-Century-page-loads-and-shows-Registration.json" \
  -F "files=@test-results/selenium/ui/full-booking-flow.test.cjs/chrome/Book-Deluxe-Sea-View-Suite-completes-the-full-booking-flow.json"
