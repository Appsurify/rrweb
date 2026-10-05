#!/bin/bash
# Release all packages under one version.
#
# Usage: scripts/release.sh <new-version> [--yes]
#   e.g. scripts/release.sh 3.52.1-alpha.1
#
# Steps (same order as the manual releases so far):
#   1. checks: branch, clean tree, not behind origin, npm login, version unused
#   2. yarn install --frozen-lockfile
#   3. lerna version  — bumps every package.json, no commit/tag/push
#   4. git commit "release: <version>"   (before publishing: changeset publish
#      tags HEAD, so the tags must land on the release commit)
#   5. yarn release   — build:all + changeset publish (+ @pkg@<version> tags)
#   6. git tag <version>
#   7. git push branch + tags
#
# Steps 5 and 7 ask for confirmation unless --yes is given.
set -euo pipefail

RELEASE_BRANCH="testmap"
REMOTE="origin"
VERSION_SOURCE="packages/rrweb/package.json"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

NEW_VERSION="${1:-}"
ASSUME_YES="false"
[[ "${2:-}" == "--yes" ]] && ASSUME_YES="true"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }
confirm() {
  [[ "$ASSUME_YES" == "true" ]] && return 0
  local answer
  read -r -p "$1 [y/N] " answer
  [[ "$answer" == "y" || "$answer" == "Y" ]] || fail "aborted by user"
}

if [[ -z "$NEW_VERSION" ]]; then
  echo "Usage: $0 <new-version> [--yes]" >&2
  exit 1
fi
[[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] \
  || fail "'$NEW_VERSION' is not a semver version"

OLD_VERSION="$(node -p "require('./$VERSION_SOURCE').version")"

# ---------------------------------------------------------------------------
step "Pre-flight checks ($OLD_VERSION -> $NEW_VERSION)"

[[ "$NEW_VERSION" != "$OLD_VERSION" ]] || fail "version $NEW_VERSION is already current"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[[ "$BRANCH" == "$RELEASE_BRANCH" ]] || fail "on branch '$BRANCH', expected '$RELEASE_BRANCH'"

[[ -z "$(git status --porcelain)" ]] || fail "working tree is not clean"

git fetch --quiet "$REMOTE" "$RELEASE_BRANCH" --tags
BEHIND="$(git rev-list --count "HEAD..$REMOTE/$RELEASE_BRANCH")"
[[ "$BEHIND" == "0" ]] || fail "branch is $BEHIND commit(s) behind $REMOTE/$RELEASE_BRANCH — pull first"

git rev-parse -q --verify "refs/tags/$NEW_VERSION" >/dev/null \
  && fail "git tag '$NEW_VERSION' already exists"

NPM_USER="$(npm whoami 2>/dev/null)" || fail "not logged in to npm — run 'npm login'"
echo "npm user: $NPM_USER"

if npm view "@appsurify-testmap/rrweb@$NEW_VERSION" version >/dev/null 2>&1; then
  fail "@appsurify-testmap/rrweb@$NEW_VERSION is already on npm"
fi

# ---------------------------------------------------------------------------
step "Install dependencies"
yarn install --frozen-lockfile

# ---------------------------------------------------------------------------
step "Bump versions to $NEW_VERSION"
# --no-git-tag-version - don't commit changes to package.json files and don't tag the release.
# --no-push - don't push committed and tagged changes.
# --include-merged-tags - include tags from merged branches when detecting changed packages.
# --yes - skip all confirmation prompts
export npm_config_git_tag_version=false
yarn lerna version --no-git-tag-version --no-push --include-merged-tags --yes "$NEW_VERSION"

UNEXPECTED="$(git diff --name-only | grep -v 'package\.json$' || true)"
[[ -z "$UNEXPECTED" ]] || fail "lerna changed more than package.json files:
$UNEXPECTED"
git diff --stat

# ---------------------------------------------------------------------------
step "Commit release"
git commit -am "release: $NEW_VERSION"

# ---------------------------------------------------------------------------
step "Build and publish to npm"
confirm "Publish $NEW_VERSION to npm as '$NPM_USER'?"
if ! yarn release; then
  cat >&2 <<EOF

Publishing failed. The release commit exists locally and some packages may
already be on npm. Fix the cause and re-run 'yarn release' — changeset publish
skips packages that are already published. Then finish manually:
  git tag $NEW_VERSION
  git push $REMOTE $RELEASE_BRANCH && git push $REMOTE --tags
EOF
  exit 1
fi

# ---------------------------------------------------------------------------
step "Tag $NEW_VERSION"
git tag "$NEW_VERSION"

# ---------------------------------------------------------------------------
step "Push to $REMOTE"
echo "Commits to push:"
git log --oneline "$REMOTE/$RELEASE_BRANCH..HEAD"
confirm "Push $RELEASE_BRANCH and tags to $REMOTE?"
git push "$REMOTE" "$RELEASE_BRANCH"
git push "$REMOTE" --tags

step "Released $NEW_VERSION"
