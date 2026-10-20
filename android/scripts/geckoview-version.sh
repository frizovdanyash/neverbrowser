#!/usr/bin/env bash
set -euo pipefail

for REPO in https://maven.mozilla.org/maven2 https://repo1.maven.org/maven2; do
  if META="$(curl -fsSL --max-time 20 "$REPO/org/mozilla/geckoview/geckoview/maven-metadata.xml" 2>/dev/null)"; then
    VERSION="$(printf '%s' "$META" | grep -o '<release>[^<]*</release>' | sed 's/<[^>]*>//g' | head -n 1)"
    if [ -z "$VERSION" ]; then
      VERSION="$(printf '%s' "$META" | grep -o '<version>[^<]*</version>' | tail -n 1 | sed 's/<[^>]*>//g')"
    fi
    if [ -n "$VERSION" ]; then
      echo "$VERSION"
      exit 0
    fi
  fi
done
echo "131.0.20240913135429"
