#!/bin/bash
# Fail if an em-dash sneaks into source (use ASCII hyphen instead).
# The character is built from octal bytes: /bin/bash on macOS is 3.2 and has
# no $'\uNNNN' expansion, so this script stays clean itself.
set -u

# shellcheck disable=SC3037
EMDASH=$(printf '\342\200\224')
MATCHES=$(grep -rn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.husky \
  --exclude=package-lock.json "$EMDASH" \
  src package.json README.md tsconfig.json eslint.config.mjs .prettierrc .editorconfig 2>/dev/null || true)

if [ -n "$MATCHES" ]; then
  echo "error: em-dash found - use a plain hyphen (-) instead:"
  echo "$MATCHES"
  exit 1
fi

echo "ok: no em-dashes"
